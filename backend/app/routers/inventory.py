import datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    InventoryItem, InventoryCount, InventoryCountLine, InventoryTransaction,
    WasteLog, AuditLog
)
from backend.app.schemas import InventoryCountCreate, WasteLogCreate
from backend.app.services.avt_engine import AvTEngine

router = APIRouter(prefix="/api/inventory", tags=["Inventory Management"])

@router.get("/counts")
def list_counts(db: Session = Depends(get_db)):
    return db.query(InventoryCount).order_by(InventoryCount.count_date.desc()).all()

@router.post("/counts")
def create_count(count_in: InventoryCountCreate, db: Session = Depends(get_db)):
    count = InventoryCount(
        name=count_in.name,
        employee_name=count_in.employee_name,
        location_name=count_in.location_name,
        status="Draft",
        notes=count_in.notes
    )
    db.add(count)
    db.flush()

    total_val = Decimal("0.00")
    for line_in in count_in.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line_in.inventory_item_id).first()
        if not item:
            continue

        unit_cost = item.current_cost or Decimal("0.00")
        factor = AvTEngine.get_unit_conversion_factor(db, item.id, line_in.counted_uom, item.base_uom)
        base_qty = line_in.counted_quantity * factor
        ext_val = base_qty * unit_cost

        count_line = InventoryCountLine(
            count_id=count.id,
            inventory_item_id=item.id,
            storage_location=line_in.storage_location,
            counted_quantity=line_in.counted_quantity,
            counted_uom=line_in.counted_uom,
            base_quantity=base_qty,
            unit_cost=unit_cost,
            extended_value=ext_val
        )
        db.add(count_line)
        total_val += ext_val

    count.total_valuation = total_val
    db.commit()
    db.refresh(count)
    return count

@router.post("/counts/{count_id}/approve")
def approve_count(count_id: str, db: Session = Depends(get_db)):
    count = db.query(InventoryCount).filter(InventoryCount.id == count_id).first()
    if not count:
        raise HTTPException(status_code=404, detail="Count not found.")

    if count.status == "Approved":
        return count

    count.status = "Approved"
    count.approved_at = datetime.datetime.utcnow()
    count.approved_by = "Manager"

    for line in count.lines:
        tx = InventoryTransaction(
            inventory_item_id=line.inventory_item_id,
            transaction_type="Inventory Count",
            quantity=line.counted_quantity,
            uom=line.counted_uom,
            converted_base_quantity=line.base_quantity,
            unit_cost=line.unit_cost,
            extended_cost=line.extended_value,
            source="Inventory Count",
            reference_id=count.id,
            user="Manager",
            notes=f"Approved Count Sheet #{count.name}"
        )
        db.add(tx)

    audit = AuditLog(
        action="Inventory Count Approved",
        entity_type="InventoryCount",
        entity_id=count.id,
        new_value=f"Approved count sheet total valuation ${count.total_valuation}"
    )
    db.add(audit)

    db.commit()
    db.refresh(count)
    return count

@router.get("/transactions")
def list_transactions(db: Session = Depends(get_db)):
    txs = db.query(InventoryTransaction).order_by(InventoryTransaction.timestamp.desc()).all()
    return [
        {
            "id": t.id,
            "timestamp": t.timestamp.isoformat(),
            "item_name": t.inventory_item.name if t.inventory_item else "",
            "transaction_type": t.transaction_type,
            "quantity": float(t.quantity),
            "uom": t.uom,
            "unit_cost": float(t.unit_cost),
            "extended_cost": float(t.extended_cost),
            "source": t.source,
            "reference_id": t.reference_id,
            "notes": t.notes
        } for t in txs
    ]

@router.get("/waste")
def list_waste_logs(db: Session = Depends(get_db)):
    wastes = db.query(WasteLog).order_by(WasteLog.timestamp.desc()).all()
    return [
        {
            "id": w.id,
            "timestamp": w.timestamp.isoformat(),
            "item_name": w.inventory_item.name if w.inventory_item else "",
            "quantity": float(w.quantity),
            "uom": w.uom,
            "unit_cost": float(w.unit_cost),
            "total_cost": float(w.total_cost),
            "reason": w.reason,
            "manager": w.manager,
            "notes": w.notes
        } for w in wastes
    ]

@router.post("/waste")
def create_waste_log(waste_in: WasteLogCreate, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == waste_in.inventory_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    unit_cost = item.current_cost or Decimal("0.00")
    factor = AvTEngine.get_unit_conversion_factor(db, item.id, waste_in.uom, item.base_uom)
    base_qty = waste_in.quantity * factor
    tot_cost = base_qty * unit_cost

    waste = WasteLog(
        inventory_item_id=item.id,
        quantity=waste_in.quantity,
        uom=waste_in.uom,
        base_quantity=base_qty,
        unit_cost=unit_cost,
        total_cost=tot_cost,
        reason=waste_in.reason,
        manager=waste_in.manager or "Manager",
        notes=waste_in.notes
    )
    db.add(waste)
    db.flush()

    # Record Inventory Ledger Waste Transaction
    tx = InventoryTransaction(
        inventory_item_id=item.id,
        transaction_type="Waste",
        quantity=-waste_in.quantity,
        uom=waste_in.uom,
        converted_base_quantity=-base_qty,
        unit_cost=unit_cost,
        extended_cost=tot_cost,
        source="Waste Log",
        reference_id=waste.id,
        user=waste_in.manager or "Manager",
        notes=f"Reason: {waste_in.reason}"
    )
    db.add(tx)

    db.commit()
    db.refresh(waste)
    return waste

