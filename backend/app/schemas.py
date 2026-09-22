from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal

# Vendor Schemas
class VendorBase(BaseModel):
    name: str
    account_number: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    is_active: bool = True

class VendorCreate(VendorBase):
    pass

class VendorResponse(VendorBase):
    id: str
    created_at: datetime
    class Config:
        from_attributes = True

# Vendor Item Schemas
class VendorItemBase(BaseModel):
    vendor_id: str
    vendor_sku: str
    description: str
    pack_size: Optional[str] = None
    unit_of_measure: Optional[str] = None
    current_cost: Decimal = Decimal("0.00")
    mapped_inventory_item_id: Optional[str] = None

class VendorItemCreate(VendorItemBase):
    pass

class VendorItemResponse(VendorItemBase):
    id: str
    created_at: datetime
    class Config:
        from_attributes = True

# Unit Conversion Schema
class UnitConversionBase(BaseModel):
    from_uom: str
    to_uom: str
    factor: Decimal

class UnitConversionCreate(UnitConversionBase):
    inventory_item_id: str

class UnitConversionResponse(UnitConversionBase):
    id: str
    inventory_item_id: str
    class Config:
        from_attributes = True

# Inventory Item Schemas
class InventoryItemBase(BaseModel):
    name: str
    sku: Optional[str] = None
    category: str = "Food"
    subcategory: Optional[str] = None
    storage_location: str = "Main Storage"
    base_uom: str = "LB"
    purchase_uom: Optional[str] = "Case"
    reporting_uom: Optional[str] = "LB"
    current_cost: Decimal = Decimal("0.00")
    preferred_vendor_id: Optional[str] = None
    is_key_item: bool = False
    is_active: bool = True

class InventoryItemCreate(InventoryItemBase):
    conversions: Optional[List[UnitConversionBase]] = []

class InventoryItemResponse(InventoryItemBase):
    id: str
    previous_cost: Decimal
    average_cost: Decimal
    last_purchase_cost: Decimal
    created_at: datetime
    conversions: List[UnitConversionResponse] = []
    class Config:
        from_attributes = True

# Invoice Schemas
class InvoiceLineBase(BaseModel):
    debug_id: Optional[str] = None
    line_number: int = 1
    vendor_sku: Optional[str] = None
    description: str
    quantity: Optional[Decimal] = None
    unit_of_measure: Optional[str] = None
    pack_size: Optional[str] = None
    unit_cost: Optional[Decimal] = None
    extended_cost: Optional[Decimal] = None
    confidence: float = 100.0
    field_confidence: Optional[str] = None
    validation_status: str = "Needs Review"
    source_boxes: Optional[str] = None
    mapped_inventory_item_id: Optional[str] = None
    is_mapped: bool = False

class InvoiceLineCreate(InvoiceLineBase):
    pass

class InvoiceLineResponse(InvoiceLineBase):
    id: str
    invoice_id: str
    class Config:
        from_attributes = True

class InvoiceBase(BaseModel):
    invoice_number: Optional[str] = None
    vendor_id: Optional[str] = None
    vendor_name_raw: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    po_number: Optional[str] = None
    subtotal: Decimal = Decimal("0.00")
    tax: Decimal = Decimal("0.00")
    delivery_fees: Decimal = Decimal("0.00")
    other_fees: Decimal = Decimal("0.00")
    credits: Decimal = Decimal("0.00")
    discounts: Decimal = Decimal("0.00")
    total_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None
    vendor_confidence: Optional[float] = 100.0
    invoice_number_confidence: Optional[float] = 100.0
    total_confidence: Optional[float] = 100.0

class InvoiceUpdate(InvoiceBase):
    status: Optional[str] = None
    lines: Optional[List[InvoiceLineBase]] = None

class InvoiceResponse(InvoiceBase):
    id: str
    status: str
    vendor_confidence: float
    invoice_number_confidence: float
    total_confidence: float
    file_path: Optional[str]
    created_at: datetime
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    lines: List[InvoiceLineResponse] = []
    class Config:
        from_attributes = True

# Inventory Count Schemas
class InventoryCountLineBase(BaseModel):
    inventory_item_id: str
    storage_location: Optional[str] = "Main Storage"
    counted_quantity: Decimal
    counted_uom: str

class InventoryCountCreate(BaseModel):
    name: str = "Count Sheet"
    employee_name: Optional[str] = None
    location_name: str = "Main Storage"
    notes: Optional[str] = None
    lines: List[InventoryCountLineBase]

# Waste Log Schemas
class WasteLogCreate(BaseModel):
    inventory_item_id: str
    quantity: Decimal
    uom: str
    reason: str
    manager: Optional[str] = None
    notes: Optional[str] = None

# Recipe Schemas
class RecipeIngredientBase(BaseModel):
    inventory_item_id: str
    quantity: Decimal
    uom: str

class RecipeCreate(BaseModel):
    name: str
    pos_identifier: Optional[str] = None
    category: str = "Entree"
    serving_yield: Decimal = Decimal("1.0")
    menu_price: Decimal = Decimal("0.00")
    ingredients: List[RecipeIngredientBase]

# Deposit Schemas
class DepositCreate(BaseModel):
    business_date: date
    deposit_date: date
    expected_cash: Decimal = Decimal("0.00")
    actual_cash: Decimal = Decimal("0.00")
    deposit_amount: Decimal = Decimal("0.00")
    deposit_reference: Optional[str] = None
    bank_reference: Optional[str] = None
    manager: Optional[str] = None
    notes: Optional[str] = None

class DepositUpdate(BaseModel):
    status: Optional[str] = None
    expected_cash: Optional[Decimal] = None
    actual_cash: Optional[Decimal] = None
    deposit_amount: Optional[Decimal] = None
    notes: Optional[str] = None

