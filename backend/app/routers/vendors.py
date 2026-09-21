from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.app.database import get_db
from backend.app.models import Vendor, VendorItem, InventoryItem
from backend.app.schemas import VendorCreate, VendorResponse, VendorItemCreate, VendorItemResponse

router = APIRouter(prefix="/api/vendors", tags=["Vendors"])

@router.get("", response_model=List[VendorResponse])
def list_vendors(db: Session = Depends(get_db)):
    return db.query(Vendor).filter(Vendor.is_active == True).all()

@router.post("", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
def create_vendor(vendor_in: VendorCreate, db: Session = Depends(get_db)):
    existing = db.query(Vendor).filter(Vendor.name == vendor_in.name).first()
    if existing:
        return existing
    vendor = Vendor(**vendor_in.dict())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor

@router.get("/{vendor_id}/items", response_model=List[VendorItemResponse])
def list_vendor_items(vendor_id: str, db: Session = Depends(get_db)):
    return db.query(VendorItem).filter(VendorItem.vendor_id == vendor_id).all()

@router.post("/items", response_model=VendorItemResponse)
def create_vendor_item(item_in: VendorItemCreate, db: Session = Depends(get_db)):
    vendor_item = db.query(VendorItem).filter(
        VendorItem.vendor_id == item_in.vendor_id,
        VendorItem.vendor_sku == item_in.vendor_sku
    ).first()

    if vendor_item:
        for k, v in item_in.dict().items():
            setattr(vendor_item, k, v)
    else:
        vendor_item = VendorItem(**item_in.dict())
        db.add(vendor_item)

    db.commit()
    db.refresh(vendor_item)
    return vendor_item

