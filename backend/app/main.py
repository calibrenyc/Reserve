import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.database import engine, Base, SessionLocal
from backend.app.models import Vendor, InventoryItem, UnitConversion
from backend.app.routers import (
    vendors, items, invoices, inventory, recipes, sales, avt, deposits, dashboard, backups, audit
)

# Create database tables safely with checkfirst=True
Base.metadata.create_all(bind=engine, checkfirst=True)

app = FastAPI(
    title="Reserve - Local-First Restaurant Back-Office System",
    version="1.0.0"
)

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(dashboard.router)
app.include_router(invoices.router)
app.include_router(vendors.router)
app.include_router(items.router)
app.include_router(inventory.router)
app.include_router(recipes.router)
app.include_router(sales.router)
app.include_router(avt.router)
app.include_router(deposits.router)
app.include_router(backups.router)
app.include_router(audit.router)

# Mount Invoice Upload Files for local review preview
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
INVOICE_DIR = os.path.join(DATA_DIR, "invoices", "original")
os.makedirs(INVOICE_DIR, exist_ok=True)

app.mount("/static/invoices", StaticFiles(directory=INVOICE_DIR), name="static_invoices")

# Mount Production React Build Static Assets
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIST_DIR = os.path.join(PROJECT_ROOT, "frontend", "dist")
ASSETS_DIR = os.path.join(DIST_DIR, "assets")

if os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="static_assets")

@app.on_event("startup")
def seed_default_data():
    db = SessionLocal()
    try:
        # Seed default vendors if empty
        if db.query(Vendor).count() == 0:
            v_sysco = Vendor(name="SYSCO", account_number="SYS-883201", contact_phone="800-555-0199")
            v_usfoods = Vendor(name="US FOODS", account_number="USF-194022", contact_phone="800-555-0188")
            v_pfg = Vendor(name="PERFORMANCE FOOD GROUP", account_number="PFG-749201")
            db.add_all([v_sysco, v_usfoods, v_pfg])
            db.flush()

        # Seed sample inventory items if empty
        if db.query(InventoryItem).count() == 0:
            item_chicken = InventoryItem(
                name="Chicken Breast Boneless",
                sku="ING-CHKN-01",
                category="Meat",
                base_uom="LB",
                purchase_uom="Case",
                reporting_uom="LB",
                current_cost=1.91,
                previous_cost=1.85,
                is_key_item=True
            )
            item_cheese = InventoryItem(
                name="Shredded Cheddar Cheese",
                sku="ING-CHSS-02",
                category="Dairy",
                base_uom="LB",
                purchase_uom="Case",
                reporting_uom="LB",
                current_cost=2.45,
                is_key_item=True
            )
            item_rice = InventoryItem(
                name="Jasmine Rice 50LB",
                sku="ING-RICE-03",
                category="Dry Goods",
                base_uom="LB",
                purchase_uom="Bag",
                reporting_uom="LB",
                current_cost=0.85
            )
            db.add_all([item_chicken, item_cheese, item_rice])
            db.flush()

            # Seed Conversions: 1 Case Chicken = 40 LB, 1 Case Cheese = 20 LB
            conv_chkn = UnitConversion(inventory_item_id=item_chicken.id, from_uom="Case", to_uom="LB", factor=40.0)
            conv_chs = UnitConversion(inventory_item_id=item_cheese.id, from_uom="Case", to_uom="LB", factor=20.0)
            db.add_all([conv_chkn, conv_chs])

        db.commit()
    finally:
        db.close()

@app.get("/{full_path:path}")
def serve_frontend_spa(full_path: str):
    # If API or static, bypass SPA
    if full_path.startswith("api/") or full_path.startswith("static/"):
        return {"error": "Not Found"}
    
    index_file = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Reserve Backend API is active."}
