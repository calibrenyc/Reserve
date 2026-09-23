from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import InventoryItem, InventoryTransaction, InventoryTransfer, Location
from backend.app.schemas import InventoryTransferCreate
from backend.app.services.avt_engine import AvTEngine

router = APIRouter(prefix="/api/transfers", tags=["Transfers"])

def serialize(transfer, locations, items):
    return {"id": transfer.id, "created_at": transfer.created_at, "from_location": locations[transfer.from_location_id].name,
            "to_location": locations[transfer.to_location_id].name, "item_name": items[transfer.inventory_item_id].name,
            "quantity": float(transfer.quantity), "uom": transfer.uom, "total_value": float(transfer.total_value),
            "notes": transfer.notes, "status": transfer.status}

@router.get("")
def list_transfers(request: Request, db: Session = Depends(get_db)):
    transfers = db.query(InventoryTransfer).execution_options(skip_tenant_scope=True).filter(
        InventoryTransfer.organization_id == request.state.organization_id
    ).order_by(InventoryTransfer.created_at.desc()).all()
    location_ids = {value for transfer in transfers for value in (transfer.from_location_id, transfer.to_location_id)}
    item_ids = {transfer.inventory_item_id for transfer in transfers}
    locations = {location.id: location for location in db.query(Location).filter(Location.id.in_(location_ids)).all()}
    items = {item.id: item for item in db.query(InventoryItem).execution_options(skip_tenant_scope=True).filter(
        InventoryItem.organization_id == request.state.organization_id, InventoryItem.id.in_(item_ids)
    ).all()}
    return [serialize(transfer, locations, items) for transfer in transfers if transfer.from_location_id in locations and transfer.to_location_id in locations and transfer.inventory_item_id in items]

@router.post("", status_code=status.HTTP_201_CREATED)
def create_transfer(payload: InventoryTransferCreate, request: Request, db: Session = Depends(get_db)):
    if payload.from_location_id == payload.to_location_id:
        raise HTTPException(400, "Choose two different restaurant locations.")
    if payload.quantity <= 0:
        raise HTTPException(400, "Transfer quantity must be greater than zero.")
    source, destination = db.get(Location, payload.from_location_id), db.get(Location, payload.to_location_id)
    item = db.query(InventoryItem).execution_options(skip_tenant_scope=True).filter(
        InventoryItem.id == payload.inventory_item_id, InventoryItem.organization_id == request.state.organization_id
    ).first()
    if not source or not destination or not item:
        raise HTTPException(404, "The selected location or item no longer exists.")
    if source.organization_id != destination.organization_id:
        raise HTTPException(400, "Locations must belong to the same organization.")
    transfer_uom = payload.uom.upper()
    configured_uoms = {unit.upper() for unit in (item.enabled_count_units or [])}
    if not configured_uoms:
        configured_uoms = {(item.base_uom or "EA").upper()}
        for conversion in item.conversions:
            configured_uoms.update({conversion.from_uom.upper(), conversion.to_uom.upper()})
    if transfer_uom not in configured_uoms:
        raise HTTPException(400, f"{payload.uom} is not a count or waste unit for {item.name}.")

    # Counts and waste use the shared conversion graph, which supports a
    # packaging chain (for example CS -> PK -> EA), not just direct rows.
    # Transfers must value inventory using that same base-unit quantity.
    factor = AvTEngine.get_unit_conversion_factor(db, item.id, transfer_uom, item.base_uom or "EA")
    base_quantity, unit_cost = payload.quantity * factor, Decimal(str(item.current_cost or 0))
    # Inventory items are organization-wide catalog records (their name/SKU is
    # globally unique), while location-specific stock lives in the transaction
    # ledger.  Duplicating an item for the destination therefore violates the
    # catalog's uniqueness constraint and caused a 500 on first transfer.
    destination_item = item
    transfer = InventoryTransfer(from_location_id=source.id, to_location_id=destination.id, inventory_item_id=item.id,
        destination_inventory_item_id=destination_item.id,
        quantity=payload.quantity, uom=transfer_uom, base_quantity=base_quantity, unit_cost=unit_cost,
        total_value=base_quantity * unit_cost, notes=payload.notes)
    db.add(transfer); db.flush()
    for location_id, ledger_item_id, tx_type, direction in [(source.id, item.id, "Transfer Out", -1), (destination.id, destination_item.id, "Transfer In", 1)]:
        db.add(InventoryTransaction(location_id=location_id, inventory_item_id=ledger_item_id, transaction_type=tx_type,
            quantity=payload.quantity * direction, uom=transfer_uom, converted_base_quantity=base_quantity * direction,
            unit_cost=unit_cost, extended_cost=base_quantity * unit_cost, source="Location Transfer", reference_id=transfer.id,
            user="Manager", notes=payload.notes))
    db.commit()
    return serialize(transfer, {source.id: source, destination.id: destination}, {item.id: item})
