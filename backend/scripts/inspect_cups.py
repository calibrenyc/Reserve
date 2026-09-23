import sqlite3
from pathlib import Path

db = sqlite3.connect(Path(__file__).resolve().parents[2] / "data" / "database" / "reserve_app.db")
for row in db.execute("SELECT id, name, sku, base_uom, current_cost FROM inventory_items WHERE lower(name) LIKE '%cup%'"):
    print(row, db.execute("SELECT from_uom, to_uom, factor FROM unit_conversions WHERE inventory_item_id=?", (row[0],)).fetchall(), db.execute("SELECT COUNT(*) FROM inventory_count_template_lines WHERE inventory_item_id=?", (row[0],)).fetchone()[0])
