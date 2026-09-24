"""One-time, source-grounded repair for the uploaded SoBol multi-unit sheet."""
import sqlite3
import uuid
from decimal import Decimal
from pathlib import Path

from backend.app.routers.inventory import _xlsx_rows, _parse_pack_size

WORKBOOK = Path(r"f:\Downloads\SoBol_Reserve_Explicit_Count_Template.xlsx")
DATABASE = Path(__file__).resolve().parents[2] / "data" / "database" / "reserve_app.db"

def number(value):
    try: return Decimal(str(value))
    except Exception: return None

def main():
    sheets = list(_xlsx_rows(WORKBOOK.read_bytes()))
    _, rows = sheets[0]  # Count Template; Importer Rules is metadata only.
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
        explicit_conversions = list(conversions)
        recipe_unit, recipe_quantity = str(row.get("Q", "")).strip().upper(), number(row.get("R"))
        if explicit_conversions and recipe_unit and recipe_quantity and recipe_quantity > 0:
            source = explicit_conversions[-1][1]
            if source != recipe_unit and (source, recipe_unit) not in {(a, b) for a, b, _ in conversions}:
                conversions.append((source, recipe_unit, recipe_quantity))
        base_uom = explicit_conversions[-1][1] if explicit_conversions else enabled[0]
        parsed_pack = _parse_pack_size(pack)
        pairs = {(source, target) for source, target, _ in conversions}
        # Vendor-pack facts are deterministic metadata. They supplement, never
        # replace, the explicit count-unit conversion columns.
        if parsed_pack:
            container = "BTL" if "BTL" in enabled else ("SLV" if "SLV" in enabled and parsed_pack["unit"] == "EA" else None)
            if not container:
                container = next((target for source, target, qty in explicit_conversions if source == "CS" and qty == parsed_pack["count"]), None)
            if not container and explicit_conversions and explicit_conversions[-1][1] in enabled:
                container = explicit_conversions[-1][1]
            if container and ("CS", container) not in pairs:
                conversions.append(("CS", container, parsed_pack["count"])); pairs.add(("CS", container))
            source = container or "CS"
            quantity = parsed_pack["quantity"] if container else parsed_pack["count"] * parsed_pack["quantity"]
            if source != parsed_pack["unit"] and (source, parsed_pack["unit"]) not in pairs:
                conversions.append((source, parsed_pack["unit"], quantity))
        targets = {target for _, target, _ in conversions}
        if recipe_unit and recipe_unit in targets:
            base_uom = recipe_unit
        elif parsed_pack and parsed_pack["unit"] in targets:
            base_uom = parsed_pack["unit"]
        count_uom = base_uom
        graph = {}
        for source, target, qty in conversions:
            graph.setdefault(source, []).append((target, qty))
        pending, visited, case_factor = [("CS", Decimal("1"))], set(), None
        while pending:
            current, factor = pending.pop(0)
            if current in visited: continue
            if current == base_uom:
                case_factor = factor; break
            visited.add(current)
            pending.extend((target, factor * qty) for target, qty in graph.get(current, []) if target not in visited)
        unit_cost = case_price / case_factor if case_factor else case_price
        db.execute("UPDATE inventory_items SET storage_location=?, pack_size=?, pack_size_raw=?, pack_count=?, pack_unit_quantity=?, pack_unit=?, enabled_count_units=?, purchase_uom='CS', base_uom=?, count_uom=?, current_cost=?, needs_review=0 WHERE id=?", (row.get("A", "Unassigned"), pack, parsed_pack["raw"] if parsed_pack else None, float(parsed_pack["count"]) if parsed_pack else None, float(parsed_pack["quantity"]) if parsed_pack else None, parsed_pack["unit"] if parsed_pack else None, __import__('json').dumps(enabled), base_uom, count_uom, float(unit_cost), item_id))
        db.execute("DELETE FROM unit_conversions WHERE inventory_item_id=?", (item_id,))
        for from_uom, to_uom, factor in conversions:
            db.execute("INSERT INTO unit_conversions (id, inventory_item_id, from_uom, to_uom, factor) VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), item_id, from_uom, to_uom, float(factor)))
        # The active count template may reference a normalized-SKU duplicate
        # created by an earlier importer. Apply the same explicit source config.
        for duplicate_id, in db.execute("SELECT id FROM inventory_items WHERE replace(sku, '.0', '') = ? AND id != ?", (sku, item_id)).fetchall():
            db.execute("UPDATE inventory_items SET storage_location=?, pack_size=?, pack_size_raw=?, pack_count=?, pack_unit_quantity=?, pack_unit=?, enabled_count_units=?, purchase_uom='CS', base_uom=?, count_uom=?, current_cost=?, needs_review=0 WHERE id=?", (row.get("A", "Unassigned"), pack, parsed_pack["raw"] if parsed_pack else None, float(parsed_pack["count"]) if parsed_pack else None, float(parsed_pack["quantity"]) if parsed_pack else None, parsed_pack["unit"] if parsed_pack else None, __import__('json').dumps(enabled), base_uom, count_uom, float(unit_cost), duplicate_id))
            db.execute("DELETE FROM unit_conversions WHERE inventory_item_id=?", (duplicate_id,))
            for from_uom, to_uom, factor in conversions:
                db.execute("INSERT INTO unit_conversions (id, inventory_item_id, from_uom, to_uom, factor) VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), duplicate_id, from_uom, to_uom, float(factor)))
        updated.append((sku, name, base_uom, float(unit_cost), conversions))
    db.commit(); db.close()
    print(f"Updated {len(updated)} items; {len(unmatched)} source rows did not match existing records.")
    for entry in updated:
        if entry[0] in {"BA", "700109", "700141"}: print(entry)

if __name__ == "__main__": main()
