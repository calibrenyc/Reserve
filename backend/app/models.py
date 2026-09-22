import uuid
import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Numeric, DateTime, Date, ForeignKey, Text, Boolean, Enum
)
from sqlalchemy.orm import relationship
from backend.app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class Location(Base):
    __tablename__ = "locations"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=True)
    address_line1 = Column(String, nullable=True)
    address_line2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    timezone = Column(String, default="America/New_York")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    organization = relationship("Organization", back_populates="locations")
    user_assignments = relationship("UserLocation", back_populates="location", cascade="all, delete-orphan")

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    # The control plane keeps this routing key; a licensed organization has an
    # isolated operational SQLite database at data/organizations/<key>.db.
    database_key = Column(String, nullable=True, unique=True, index=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    locations = relationship("Location", back_populates="organization")
    users = relationship("User", back_populates="organization")

class Role(Base):
    __tablename__ = "roles"
    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    is_system = Column(Boolean, default=False)

class RolePermission(Base):
    __tablename__ = "role_permissions"
    id = Column(String, primary_key=True, default=generate_uuid)
    role_id = Column(String, ForeignKey("roles.id"), nullable=False, index=True)
    permission = Column(String, nullable=False, index=True)
    allowed = Column(Boolean, default=True)

class UserLocation(Base):
    __tablename__ = "user_locations"
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    location_id = Column(String, ForeignKey("locations.id"), primary_key=True)
    user = relationship("User", back_populates="location_assignments")
    location = relationship("Location", back_populates="user_assignments")

class UserPermissionOverride(Base):
    __tablename__ = "user_permission_overrides"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    permission = Column(String, nullable=False, index=True)
    # True = custom allow, False = custom deny; absence means inherited.
    allowed = Column(Boolean, nullable=False)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="manager")
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    is_platform_owner = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    organization = relationship("Organization", back_populates="users")
    location_assignments = relationship("UserLocation", back_populates="user", cascade="all, delete-orphan")

class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String, nullable=False, unique=True)
    account_number = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    items = relationship("VendorItem", back_populates="vendor", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="vendor")

class VendorItem(Base):
    __tablename__ = "vendor_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=False)
    vendor_sku = Column(String, nullable=False)
    description = Column(String, nullable=False)
    pack_size = Column(String, nullable=True)
    unit_of_measure = Column(String, nullable=True)
    current_cost = Column(Numeric(12, 4), default=0.0)
    mapped_inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    vendor = relationship("Vendor", back_populates="items")
    mapped_inventory_item = relationship("InventoryItem", back_populates="vendor_items")

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String, nullable=False, unique=True)
    sku = Column(String, nullable=True, unique=True)
    category = Column(String, nullable=False, default="Food")  # Food, Produce, Meat, Dairy, Dry Goods, Beverage, Packaging, Cleaning, Supplies
    subcategory = Column(String, nullable=True)
    storage_location = Column(String, default="Main Storage")
    base_uom = Column(String, nullable=False, default="LB")  # Base UOM (e.g. LB, OZ, GAL, EA)
    purchase_uom = Column(String, nullable=True, default="Case")
    reporting_uom = Column(String, nullable=True, default="LB")
    current_cost = Column(Numeric(12, 4), default=0.0)  # Cost per base UOM
    previous_cost = Column(Numeric(12, 4), default=0.0)
    average_cost = Column(Numeric(12, 4), default=0.0)
    last_purchase_cost = Column(Numeric(12, 4), default=0.0)
    preferred_vendor_id = Column(String, ForeignKey("vendors.id"), nullable=True)
    is_key_item = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    # Item master additions.  Existing operational foreign keys intentionally
    # continue to point here; this is the single product catalog.
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    display_name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    storage_area_id = Column(String, ForeignKey("storage_areas.id"), nullable=True)
    count_uom = Column(String, nullable=True)
    recipe_uom = Column(String, nullable=True)
    pack_size = Column(String, nullable=True)
    case_size = Column(String, nullable=True)
    conversion_factor = Column(Numeric(12, 4), nullable=True)
    par_level = Column(Numeric(12, 4), nullable=True)
    needs_review = Column(Boolean, default=False)
    created_from_import = Column(Boolean, default=False)
    source_import_id = Column(String, ForeignKey("item_imports.id"), nullable=True)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    vendor_items = relationship("VendorItem", back_populates="mapped_inventory_item")
    conversions = relationship("UnitConversion", back_populates="inventory_item", cascade="all, delete-orphan")
    count_lines = relationship("InventoryCountLine", back_populates="inventory_item")
    transactions = relationship("InventoryTransaction", back_populates="inventory_item")
    waste_logs = relationship("WasteLog", back_populates="inventory_item")
    recipe_ingredients = relationship("RecipeIngredient", back_populates="inventory_item")

class ItemCategory(Base):
    __tablename__ = "item_categories"
    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

class StorageArea(Base):
    __tablename__ = "storage_areas"
    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

class ItemImport(Base):
    __tablename__ = "item_imports"
    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    filename = Column(String, nullable=False)
    source_type = Column(String, nullable=False)
    mapping_json = Column(Text, nullable=True)
    rows_json = Column(Text, nullable=False)
    status = Column(String, default="Preview")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class InventoryCountTemplate(Base):
    __tablename__ = "inventory_count_templates"
    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    name = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    lines = relationship("InventoryCountTemplateLine", back_populates="template", cascade="all, delete-orphan")

class InventoryCountTemplateLine(Base):
    __tablename__ = "inventory_count_template_lines"
    id = Column(String, primary_key=True, default=generate_uuid)
    template_id = Column(String, ForeignKey("inventory_count_templates.id"), nullable=False)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    storage_location = Column(String, nullable=False, default="Main Storage")
    sort_order = Column(Integer, default=0)
    template = relationship("InventoryCountTemplate", back_populates="lines")
    inventory_item = relationship("InventoryItem")

class UnitConversion(Base):
    __tablename__ = "unit_conversions"

    id = Column(String, primary_key=True, default=generate_uuid)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    from_uom = Column(String, nullable=False)  # e.g., Case
    to_uom = Column(String, nullable=False)    # e.g., LB
    factor = Column(Numeric(12, 4), nullable=False)  # 1 Case = factor * to_uom (e.g., 20)

    inventory_item = relationship("InventoryItem", back_populates="conversions")

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    invoice_number = Column(String, nullable=True)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=True)
    vendor_name_raw = Column(String, nullable=True)
    invoice_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    po_number = Column(String, nullable=True)
    status = Column(String, default="Uploaded")  # Uploaded, Processing, Needs Review, Approved, Rejected, Archived
    
    subtotal = Column(Numeric(12, 2), default=0.0)
    tax = Column(Numeric(12, 2), default=0.0)
    delivery_fees = Column(Numeric(12, 2), default=0.0)
    other_fees = Column(Numeric(12, 2), default=0.0)
    credits = Column(Numeric(12, 2), default=0.0)
    discounts = Column(Numeric(12, 2), default=0.0)
    total_amount = Column(Numeric(12, 2), default=0.0)

    # Confidence scores (0 - 100)
    vendor_confidence = Column(Float, default=100.0)
    invoice_number_confidence = Column(Float, default=100.0)
    total_confidence = Column(Float, default=100.0)

    file_path = Column(String, nullable=True)
    raw_ocr_text = Column(Text, nullable=True)
    # Immutable evidence from the import pipeline.  Kept separately from notes so
    # review decisions never overwrite OCR/layout/validation evidence.
    pipeline_debug = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String, nullable=True)

    vendor = relationship("Vendor", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")

class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    line_number = Column(Integer, default=1)
    debug_id = Column(String, nullable=True)
    vendor_sku = Column(String, nullable=True)
    description = Column(String, nullable=False)
    quantity = Column(Numeric(12, 4), nullable=True)
    unit_of_measure = Column(String, nullable=True)
    pack_size = Column(String, nullable=True)
    unit_cost = Column(Numeric(12, 4), nullable=True)
    extended_cost = Column(Numeric(12, 2), nullable=True)
    confidence = Column(Float, default=100.0)
    field_confidence = Column(Text, nullable=True)  # JSON, per extracted field
    validation_status = Column(String, default="Needs Review")
    source_boxes = Column(Text, nullable=True)  # JSON field -> OCR bounding box
    mapped_inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=True)
    is_mapped = Column(Boolean, default=False)

    invoice = relationship("Invoice", back_populates="lines")
    mapped_inventory_item = relationship("InventoryItem")

class InventoryCount(Base):
    __tablename__ = "inventory_counts"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    name = Column(String, nullable=False, default="Daily/Weekly Count")
    count_date = Column(DateTime, default=datetime.datetime.utcnow)
    employee_name = Column(String, nullable=True)
    location_name = Column(String, default="Main Storage")
    status = Column(String, default="Draft")  # Draft, In Progress, Completed, Approved
    notes = Column(Text, nullable=True)
    total_valuation = Column(Numeric(12, 2), default=0.0)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String, nullable=True)

    lines = relationship("InventoryCountLine", back_populates="count", cascade="all, delete-orphan")

class InventoryCountLine(Base):
    __tablename__ = "inventory_count_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    count_id = Column(String, ForeignKey("inventory_counts.id"), nullable=False)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    storage_location = Column(String, nullable=True)
    counted_quantity = Column(Numeric(12, 4), nullable=False, default=0.0)
    counted_uom = Column(String, nullable=False, default="LB")
    base_quantity = Column(Numeric(12, 4), nullable=False, default=0.0)
    unit_cost = Column(Numeric(12, 4), nullable=False, default=0.0)
    extended_value = Column(Numeric(12, 2), nullable=False, default=0.0)

    count = relationship("InventoryCount", back_populates="lines")
    inventory_item = relationship("InventoryItem", back_populates="count_lines")

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    transaction_type = Column(String, nullable=False)  # Purchase, Inventory Count, Transfer In, Transfer Out, Waste, Adjustment, Donation, Return, Credit
    quantity = Column(Numeric(12, 4), nullable=False)  # Signed or absolute depending on type
    uom = Column(String, nullable=False)
    converted_base_quantity = Column(Numeric(12, 4), nullable=False)
    unit_cost = Column(Numeric(12, 4), nullable=False)
    extended_cost = Column(Numeric(12, 2), nullable=False)
    source = Column(String, nullable=True)
    reference_id = Column(String, nullable=True)  # Invoice ID, Waste Log ID, Count ID, etc.
    user = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    inventory_item = relationship("InventoryItem", back_populates="transactions")

class WasteLog(Base):
    __tablename__ = "waste_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False)
    uom = Column(String, nullable=False)
    base_quantity = Column(Numeric(12, 4), nullable=False)
    unit_cost = Column(Numeric(12, 4), nullable=False)
    total_cost = Column(Numeric(12, 2), nullable=False)
    reason = Column(String, nullable=False)  # Expired, Spoiled, Overproduction, Prep Waste, Dropped, Customer Return, Quality, Other
    manager = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    inventory_item = relationship("InventoryItem", back_populates="waste_logs")

class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String, nullable=False, unique=True)
    pos_identifier = Column(String, nullable=True)
    category = Column(String, default="Entree")
    serving_yield = Column(Numeric(12, 2), default=1.0)
    menu_price = Column(Numeric(12, 2), default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    ingredients = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan")

class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id = Column(String, primary_key=True, default=generate_uuid)
    recipe_id = Column(String, ForeignKey("recipes.id"), nullable=False)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False, default=1.0)
    uom = Column(String, nullable=False, default="OZ")

    recipe = relationship("Recipe", back_populates="ingredients")
    inventory_item = relationship("InventoryItem", back_populates="recipe_ingredients")

class SalesImport(Base):
    __tablename__ = "sales_imports"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    import_date = Column(DateTime, default=datetime.datetime.utcnow)
    filename = Column(String, nullable=False)
    file_hash = Column(String, nullable=False, unique=True)  # Prevents duplicate import
    business_date = Column(Date, nullable=False)
    total_records = Column(Integer, default=0)
    total_net_sales = Column(Numeric(12, 2), default=0.0)

    lines = relationship("SalesLine", back_populates="sales_import", cascade="all, delete-orphan")

class SalesLine(Base):
    __tablename__ = "sales_lines"

    id = Column(String, primary_key=True, default=generate_uuid)
    sales_import_id = Column(String, ForeignKey("sales_imports.id"), nullable=False)
    business_date = Column(Date, nullable=False)
    pos_item_id = Column(String, nullable=True)
    menu_item_name = Column(String, nullable=False)
    recipe_id = Column(String, ForeignKey("recipes.id"), nullable=True)
    quantity_sold = Column(Numeric(12, 4), nullable=False, default=0.0)
    net_sales = Column(Numeric(12, 2), nullable=False, default=0.0)

    sales_import = relationship("SalesImport", back_populates="lines")
    recipe = relationship("Recipe")

class Deposit(Base):
    __tablename__ = "deposits"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    business_date = Column(Date, nullable=False)
    deposit_date = Column(Date, nullable=False)
    expected_cash = Column(Numeric(12, 2), default=0.0)
    actual_cash = Column(Numeric(12, 2), default=0.0)
    deposit_amount = Column(Numeric(12, 2), default=0.0)
    over_short = Column(Numeric(12, 2), default=0.0)
    deposit_reference = Column(String, nullable=True)
    bank_reference = Column(String, nullable=True)
    manager = Column(String, nullable=True)
    status = Column(String, default="Open")  # Open, Prepared, Deposited, Verified
    attachment_path = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class CostHistory(Base):
    __tablename__ = "cost_history"

    id = Column(String, primary_key=True, default=generate_uuid)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=True)
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=True)
    date = Column(Date, nullable=False, default=datetime.date.today)
    unit_cost = Column(Numeric(12, 4), nullable=False)
    previous_cost = Column(Numeric(12, 4), nullable=False)
    dollar_change = Column(Numeric(12, 4), nullable=False)
    percent_change = Column(Float, nullable=False)

    inventory_item = relationship("InventoryItem")
    vendor = relationship("Vendor")
    invoice = relationship("Invoice")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    user = Column(String, default="System/Manager")
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    original_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    details = Column(Text, nullable=True)

class VendorOcrRule(Base):
    __tablename__ = "vendor_ocr_rules"

    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=False)
    field_name = Column(String, nullable=False)  # invoice_number, date, total, etc.
    regex_pattern = Column(String, nullable=False)
    sample_text = Column(Text, nullable=True)

    vendor = relationship("Vendor")
