"""One-time, source-grounded repair for the uploaded SoBol multi-unit sheet."""
import sqlite3
import uuid
from decimal import Decimal
from pathlib import Path

from backend.app.routers.inventory import _xlsx_rows

WORKBOOK = Path(r"f:\Downloads\SoBol_Reserve_Explicit_Count_Template.xlsx")
DATABASE = Path(__file__).resolve().parents[2] / "data" / "database" / "reserve_app.db"

def number(value):
    try: return Decimal(str(value))
    except Exception: return None

def main():
    sheets = list(_xlsx_rows(WORKBOOK.read_bytes()))
    rows = sheets[0]  # Count Template; Importer Rules is metadata only.
    data = rows[3:]
    db = sqlite3.connect(DATABASE)
    updated, unmatched = [], []
    for row in data:
        sku, name, pack, case_price = str(row.get("B", "")).strip(), str(row.get("C", "")).strip(), str(row.get("D", "")).strip(), number(row.get("E"))
        if not sku or not name or not case_price: continue
        found = db.execute("SELECT id FROM inventory_items WHERE replace(sku, '.0', '') = ? OR name = ? LIMIT 1", (sku, name)).fetchone()
        if not found:
            unmatched.append((sku, name)); continue
        item_id = found[0]
        enabled = [unit for unit, column in (("CS", "F"), ("SLV", "G"), ("PK", "H"), ("BTL", "I"), ("EA", "J")) if str(row.get(column, "")).strip().upper() in {"Y", "YES", "TRUE", "1"}]
        if not enabled: continue
        conversions = []
        for start, end, qty in (("K", "L", "M"), ("N", "O", "P")):
            from_uom, to_uom, factor = str(row.get(start, "")).strip().upper(), str(row.get(end, "")).strip().upper(), number(row.get(qty))
            if from_uom and to_uom and factor and factor > 0: conversions.append((from_uom, to_uom, factor))
        base_uom = conversions[-1][1] if conversions else enabled[0]
        count_uom = base_uom
        factor = Decimal("1")
        current = "CS"
        for from_uom, to_uom, qty in conversions:
            if from_uom == current: factor *= qty; current = to_uom
        unit_cost = case_price / factor if current == base_uom else case_price
        db.execute("UPDATE inventory_items SET storage_location=?, pack_size=?, purchase_uom='CS', base_uom=?, count_uom=?, current_cost=?, needs_review=0 WHERE id=?", (row.get("A", "Unassigned"), pack, base_uom, count_uom, float(unit_cost), item_id))
        db.execute("DELETE FROM unit_conversions WHERE inventory_item_id=?", (item_id,))
        for from_uom, to_uom, factor in conversions:
            db.execute("INSERT INTO unit_conversions (id, inventory_item_id, from_uom, to_uom, factor) VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), item_id, from_uom, to_uom, float(factor)))
        # The active count template may reference a normalized-SKU duplicate
        # created by an earlier importer. Apply the same explicit source config.
        for duplicate_id, in db.execute("SELECT id FROM inventory_items WHERE replace(sku, '.0', '') = ? AND id != ?", (sku, item_id)).fetchall():
            db.execute("UPDATE inventory_items SET storage_location=?, pack_size=?, purchase_uom='CS', base_uom=?, count_uom=?, current_cost=?, needs_review=0 WHERE id=?", (row.get("A", "Unassigned"), pack, base_uom, count_uom, float(unit_cost), duplicate_id))
            db.execute("DELETE FROM unit_conversions WHERE inventory_item_id=?", (duplicate_id,))
            for from_uom, to_uom, factor in conversions:
                db.execute("INSERT INTO unit_conversions (id, inventory_item_id, from_uom, to_uom, factor) VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), duplicate_id, from_uom, to_uom, float(factor)))
        updated.append((sku, name, base_uom, float(unit_cost), conversions))
    db.commit(); db.close()
    print(f"Updated {len(updated)} items; {len(unmatched)} source rows did not match existing records.")
    for entry in updated:
        if entry[0] in {"BA", "700109", "700141"}: print(entry)

if __name__ == "__main__": main()
