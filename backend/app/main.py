import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.database import engine, Base, SessionLocal, current_organization_id, current_location_id, current_database_key
from backend.app.models import Vendor, InventoryItem, UnitConversion, Organization, Location, User, Role, RolePermission, UserLocation
from backend.app.security import ALL_PERMISSIONS, MANAGER_PERMISSIONS, hash_password, token_user, user_permissions, location_ids
from backend.app.routers import (
    vendors, items, invoices, inventory, transfers, recipes, sales, avt, deposits, dashboard, backups, audit, auth, admin, business_start
)

# Create database tables safely with checkfirst=True
Base.metadata.create_all(bind=engine, checkfirst=True)

# SQLite's create_all does not add fields to installations created by earlier
# releases. These additive migrations preserve existing operational records.
from sqlalchemy import text, func
with engine.begin() as connection:
    # Add every newly modeled column without rewriting historical tables.
    for table in Base.metadata.tables.values():
        existing = {row[1] for row in connection.execute(text(f"PRAGMA table_info({table.name})"))}
        for column in table.columns:
            if column.name in existing or column.primary_key: continue
            if column.server_default is not None: default = f" DEFAULT {column.server_default.arg}"
            elif column.default is not None and getattr(column.default, "is_scalar", False): default = f" DEFAULT {repr(column.default.arg)}"
            else: default = ""
            type_sql = column.type.compile(engine.dialect)
            connection.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {column.name} {type_sql}{default}"))
    for table, column, definition in [
        ("invoices", "pipeline_debug", "TEXT"),
        ("invoice_lines", "field_confidence", "TEXT"),
        ("invoice_lines", "validation_status", "VARCHAR DEFAULT 'Needs Review'"),
        ("invoice_lines", "source_boxes", "TEXT"),
        ("invoice_lines", "debug_id", "VARCHAR"),
    ]:
        existing = {row[1] for row in connection.execute(text(f"PRAGMA table_info({table})"))}
        if column not in existing:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))

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
app.include_router(transfers.router)
app.include_router(recipes.router)
app.include_router(sales.router)
app.include_router(avt.router)
app.include_router(deposits.router)
app.include_router(backups.router)
app.include_router(audit.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(business_start.router)

@app.middleware("http")
async def enforce_api_access(request, call_next):
    """Authenticate every operational API call and verify its selected location."""
    path = request.url.path
    if not path.startswith("/api/") or path.startswith("/api/auth"):
        return await call_next(request)
    db = SessionLocal()
    try:
        try:
            user = token_user(request.headers.get("Authorization", "").removeprefix("Bearer ").strip(), db)
        except HTTPException as exc:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        except Exception:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Invalid or expired session"}, status_code=401)

        if path.startswith("/api/admin"):
            request.state.user_id = user.id
            return await call_next(request)
        permission = (
            "invoices.approve" if "/approve" in path else
            "invoices.view" if path.startswith("/api/invoices") and request.method == "GET" else
            "invoices.create" if path.startswith("/api/invoices") and request.method == "POST" else
            "invoices.edit" if path.startswith("/api/invoices") else
            "vendors.view" if path.startswith("/api/vendors") and request.method == "GET" else
            "vendors.manage" if path.startswith("/api/vendors") else
            "items.view" if path.startswith("/api/items") and request.method == "GET" else
            "items.create" if path.startswith("/api/items") and request.method == "POST" else
            "items.edit" if path.startswith("/api/items") else
            "waste.view" if path.startswith("/api/inventory/waste") and request.method == "GET" else
            "waste.create" if path.startswith("/api/inventory/waste") and request.method == "POST" else
            "waste.delete" if path.startswith("/api/inventory/waste") and request.method == "DELETE" else
            "inventory.view" if path.startswith("/api/inventory") and request.method == "GET" else
            "inventory.count" if path.startswith("/api/inventory") else
            "transfers.view" if path.startswith("/api/transfers") and request.method == "GET" else
            "transfers.create" if path.startswith("/api/transfers") else
            "recipes.view" if path.startswith("/api/recipes") and request.method == "GET" else
            "recipes.manage" if path.startswith("/api/recipes") else
            "sales.view" if path.startswith("/api/sales") and request.method == "GET" else
            "sales.import" if path.startswith("/api/sales") else
            "deposits.view" if path.startswith("/api/deposits") and request.method == "GET" else
            "deposits.create" if path.startswith("/api/deposits") else
            "financials.view_avt" if path.startswith("/api/avt") else
            "dashboard.view" if path.startswith("/api/dashboard") else
            "audit.view" if path.startswith("/api/audit") else
            "backups.create" if path.startswith("/api/backups") else None
        )
        granted_permissions = user_permissions(user, db)
        # Managers need a read-only lookup for count, recipe, invoice and waste
        # entry, but that does not expose the administrative Item Master tab.
        if permission and permission not in granted_permissions and not (permission == "items.view" and "items.lookup" in granted_permissions):
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": f"Missing permission: {permission}"}, status_code=403)
        selected = request.headers.get("X-Location-ID")
        allowed = location_ids(user, db)
        if not selected and len(allowed) == 1: selected = next(iter(allowed))
        if not selected or selected not in allowed:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "A permitted location must be selected"}, status_code=403)
        request.state.user_id, request.state.location_id, request.state.organization_id = user.id, selected, user.organization_id
        organization = db.get(Organization, user.organization_id)
        org_token = current_organization_id.set(user.organization_id)
        location_token = current_location_id.set(selected)
        database_token = current_database_key.set(organization.database_key) if organization and organization.database_key else None
        try: return await call_next(request)
        finally:
            current_organization_id.reset(org_token); current_location_id.reset(location_token)
            if database_token is not None: current_database_key.reset(database_token)
    except Exception as exc:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": f"Internal server error: {exc}", "success": False}, status_code=500)
    finally: db.close()

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
        org = db.query(Organization).filter(Organization.name == "Reserve Demo").first()
        if not org:
            org = Organization(name="Reserve Demo"); db.add(org); db.flush()
        elif not org.database_key:
            # Preserve the original database for the demo tenant; new licenses
            # are provisioned into their own files.
            org.database_key = None
        location = db.query(Location).filter(Location.organization_id == org.id, Location.name == "Main Restaurant").first()
        if not location:
            location = Location(organization_id=org.id, name="Main Restaurant"); db.add(location); db.flush()
        roles = {}
        for role_name, permissions in (("OWNER", ALL_PERMISSIONS), ("MANAGER", MANAGER_PERMISSIONS)):
            role = db.query(Role).filter(Role.organization_id == org.id, Role.name == role_name).first()
            if not role:
                role = Role(organization_id=org.id, name=role_name, description=f"Default {role_name.title()} role", is_system=True); db.add(role); db.flush()
            roles[role_name] = role
            existing = {p.permission for p in db.query(RolePermission).filter(RolePermission.role_id == role.id)}
            db.add_all([RolePermission(role_id=role.id, permission=p, allowed=True) for p in permissions if p not in existing])
        for first, last, email, role_name, password in (("Owner", "User", "owner@reserve.local", "OWNER", "ChangeMeNow!"), ("Manager", "User", "manager@reserve.local", "MANAGER", "ChangeMeNow!"), ("Rudy", "Cordero", "RudyCordero@Reserve", "OWNER", "admin")):
            user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
            if not user:
                user = User(username=email, full_name=f"{first} {last}", first_name=first, last_name=last, email=email, password_hash=hash_password(password), organization_id=org.id, role=role_name)
                db.add(user); db.flush()
            elif email.lower() == "rudycordero@reserve":
                # Keep the requested local admin credential current on existing installs.
                user.password_hash = hash_password(password)
                user.role = "OWNER"
                user.is_platform_owner = True
            if not db.query(UserLocation).filter(UserLocation.user_id == user.id, UserLocation.location_id == location.id).first(): db.add(UserLocation(user_id=user.id, location_id=location.id))
        # Seed default vendors if empty
        if db.query(Vendor).count() == 0:
            v_sysco = Vendor(name="SYSCO", organization_id=org.id, account_number="SYS-883201", contact_phone="800-555-0199")
            v_usfoods = Vendor(name="US FOODS", organization_id=org.id, account_number="USF-194022", contact_phone="800-555-0188")
            v_pfg = Vendor(name="PERFORMANCE FOOD GROUP", organization_id=org.id, account_number="PFG-749201")
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

        # Existing single-location records become Main Restaurant records.
        for model in (Vendor, InventoryItem):
            db.query(model).filter(model.organization_id == None).update({model.organization_id: org.id, model.location_id: location.id})
            db.query(model).filter(model.organization_id == org.id, model.location_id == None).update({model.location_id: location.id})
        from backend.app.models import Invoice, InvoiceLine, InventoryCountTemplate, InventoryCount, InventoryTransaction, WasteLog, Recipe, SalesImport, Deposit, AuditLog
        for model in (Invoice, InvoiceLine, InventoryCountTemplate, InventoryCount, InventoryTransaction, WasteLog, SalesImport, Deposit, AuditLog):
            db.query(model).filter(model.organization_id == None).update({model.organization_id: org.id, model.location_id: location.id})
        db.query(Recipe).filter(Recipe.organization_id == None).update({Recipe.organization_id: org.id, Recipe.location_id: location.id})
        db.query(Recipe).filter(Recipe.organization_id == org.id, Recipe.location_id == None).update({Recipe.location_id: location.id})

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
