import sqlite3
from pathlib import Path

db = sqlite3.connect(Path(__file__).resolve().parents[2] / "data" / "database" / "reserve_app.db")
for row in db.execute("SELECT r.name, i.name, ri.quantity, ri.uom, i.base_uom, i.current_cost FROM recipes r JOIN recipe_ingredients ri ON ri.recipe_id=r.id JOIN inventory_items i ON i.id=ri.inventory_item_id WHERE r.name LIKE '%Blend%' ORDER BY r.name LIMIT 25"):
    print(row)
