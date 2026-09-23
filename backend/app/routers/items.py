from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal

from backend.app.database import get_db, current_location_id, current_organization_id
from backend.app.models import InventoryItem, UnitConversion, CostHistory, ItemCategory, StorageArea
from backend.app.security import require
from backend.app.schemas import InventoryItemCreate, InventoryItemResponse, UnitConversionCreate, UnitConversionResponse

router = APIRouter(prefix="/api/items", tags=["Inventory Items"])

@router.get("", response_model=List[InventoryItemResponse])
def list_inventory_items(category: Optional[str] = None, storage_area: Optional[str] = None, needs_review: Optional[bool] = None, include_archived: bool = False, key_items_only: bool = False, db: Session = Depends(get_db)):
    # Items are a shared organization catalog.  Counts, transactions, waste,
    # and templates carry the restaurant location; filtering the catalog by its
    # original import location made a transferred/imported item disappear at a
    # new restaurant.
    query = (db.query(InventoryItem).execution_options(skip_tenant_scope=True)
             .filter(InventoryItem.organization_id == current_organization_id.get()))
    if not include_archived:
        query = query.filter(InventoryItem.is_active == True)
    if category:
        query = query.filter(InventoryItem.category == category)
    if key_items_only:
        query = query.filter(InventoryItem.is_key_item == True)
    if storage_area: query = query.filter(InventoryItem.storage_location == storage_area)
    if needs_review is not None: query = query.filter(InventoryItem.needs_review == needs_review)
    return query.all()

@router.post("", response_model=InventoryItemResponse)
def create_inventory_item(item_in: InventoryItemCreate, db: Session = Depends(get_db)):
    existing = db.query(InventoryItem).filter(InventoryItem.name == item_in.name, InventoryItem.location_id == current_location_id.get()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Inventory item '{item_in.name}' already exists.")

    item_dict = item_in.dict(exclude={"conversions"})
    item = InventoryItem(**item_dict)
    db.add(item)
    db.flush()

    if item_in.conversions:
        for conv in item_in.conversions:
            u_conv = UnitConversion(
                inventory_item_id=item.id,
                from_uom=conv.from_uom,
                to_uom=conv.to_uom,
                factor=conv.factor
            )
            db.add(u_conv)

    db.commit()
    db.refresh(item)
    return item

@router.patch("/{item_id}")
def update_item(item_id: str, payload: dict, db: Session = Depends(get_db)):
    item = db.get(InventoryItem, item_id)
    if not item: raise HTTPException(404, "Item not found")
    allowed = {"name", "display_name", "description", "category", "subcategory", "storage_location", "base_uom", "count_uom", "purchase_uom", "recipe_uom", "pack_size", "case_size", "conversion_factor", "current_cost", "par_level", "notes", "needs_review", "is_active"}
    for key, value in payload.items():
        if key in allowed: setattr(item, key, value)
    db.commit(); db.refresh(item); return item

@router.post("/{item_id}/archive")
def archive_item(item_id: str, db: Session = Depends(get_db)):
    item = db.get(InventoryItem, item_id)
    if not item: raise HTTPException(404, "Item not found")
    item.is_active = False; db.commit(); return {"id": item.id, "archived": True}

@router.get("/catalog/categories")
def categories(db: Session = Depends(get_db)): return db.query(ItemCategory).filter(ItemCategory.is_active == True).order_by(ItemCategory.sort_order, ItemCategory.name).all()

@router.post("/catalog/categories")
def create_category(payload: dict, db: Session = Depends(get_db)):
    value = (payload.get("name") or "").strip()
    if not value: raise HTTPException(400, "Category name is required")
    obj = ItemCategory(name=value, sort_order=payload.get("sort_order", 0)); db.add(obj); db.commit(); return obj

@router.get("/catalog/storage-areas")
def storage_areas(db: Session = Depends(get_db)): return db.query(StorageArea).filter(StorageArea.is_active == True).order_by(StorageArea.sort_order, StorageArea.name).all()

@router.post("/catalog/storage-areas")
def create_storage_area(payload: dict, db: Session = Depends(get_db)):
    value = (payload.get("name") or "").strip()
    if not value: raise HTTPException(400, "Storage area name is required")
    obj = StorageArea(name=value, location_id=payload.get("location_id"), sort_order=payload.get("sort_order", 0)); db.add(obj); db.commit(); return obj

@router.patch("/{item_id}/cost")
def update_item_cost(item_id: str, payload: dict, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")
    try:
        new_cost = Decimal(str(payload.get("current_cost")))
    except Exception:
        raise HTTPException(status_code=400, detail="Provide a valid dollar amount.")
    if new_cost < 0:
        raise HTTPException(status_code=400, detail="Cost cannot be negative.")
    item.previous_cost = item.current_cost
    item.current_cost = new_cost
    previous = item.previous_cost or Decimal("0")
    change = new_cost - previous
    percent = float((change / previous * 100) if previous else (Decimal("100") if new_cost else Decimal("0")))
    db.add(CostHistory(inventory_item_id=item.id, unit_cost=new_cost, previous_cost=previous, dollar_change=change, percent_change=percent))
    db.commit()
    return {"id": item.id, "current_cost": float(item.current_cost)}

@router.get("/{item_id}/cost-history")
def get_item_cost_history(item_id: str, db: Session = Depends(get_db)):
    history = db.query(CostHistory).filter(CostHistory.inventory_item_id == item_id).order_by(CostHistory.date.desc()).all()
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    return {
        "item_name": item.name if item else "",
        "current_cost": float(item.current_cost) if item else 0.0,
        "previous_cost": float(item.previous_cost) if item else 0.0,
        "history": [
            {
                "date": h.date.isoformat(),
                "unit_cost": float(h.unit_cost),
                "previous_cost": float(h.previous_cost),
                "dollar_change": float(h.dollar_change),
                "percent_change": h.percent_change
            } for h in history
        ]
    }
