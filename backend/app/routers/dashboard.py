import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.database import get_db, current_location_id
from backend.app.models import (
    Invoice, InventoryItem, InventoryCount, InventoryCountLine, InventoryTransaction,
    WasteLog, Deposit, CostHistory
)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary")
def get_dashboard_summary(request: Request, db: Session = Depends(get_db)):
    today = datetime.date.today()
    week_ago = today - datetime.timedelta(days=7)
    location_id = request.state.location_id

    # Invoices needing review
    needs_review_count = db.query(Invoice).filter(Invoice.location_id == location_id, Invoice.status == "Needs Review").count()
    invoices_this_week = db.query(Invoice).filter(Invoice.location_id == location_id, func.date(Invoice.created_at) >= week_ago).count()
    purchases_this_week = db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0)).filter(
        Invoice.location_id == location_id, func.date(Invoice.created_at) >= week_ago,
        Invoice.status == "Approved"
    ).scalar()

    # Inventory valuation is the latest approved count at this restaurant plus
    # all ledger movement since that count.  This makes a transfer visible on
    # both dashboards immediately instead of showing a placeholder cost × 10.
    latest_counts = {}
    for line in db.query(InventoryCountLine).execution_options(skip_tenant_scope=True).join(InventoryCount).filter(
        InventoryCount.location_id == location_id, InventoryCount.status == "Approved"
    ).order_by(InventoryCount.count_date.desc()).all():
        latest_counts.setdefault(line.inventory_item_id, line)
    balances = {item_id: Decimal(str(line.base_quantity or 0)) for item_id, line in latest_counts.items()}
    counted_at = {item_id: line.count.count_date for item_id, line in latest_counts.items()}
    costs = {item_id: Decimal(str(line.unit_cost or 0)) for item_id, line in latest_counts.items()}
    movements = db.query(InventoryTransaction).execution_options(skip_tenant_scope=True).filter(InventoryTransaction.location_id == location_id).all()
    for movement in movements:
        if movement.transaction_type == "Inventory Count":
            continue
        if movement.inventory_item_id in counted_at and movement.timestamp <= counted_at[movement.inventory_item_id]:
            continue
        balances[movement.inventory_item_id] = balances.get(movement.inventory_item_id, Decimal("0")) + Decimal(str(movement.converted_base_quantity or 0))
        costs.setdefault(movement.inventory_item_id, Decimal(str(movement.unit_cost or 0)))
    inventory_valuation = sum(balance * costs.get(item_id, Decimal("0")) for item_id, balance in balances.items())

    # Recent Price Increases
    recent_price_increases = db.query(CostHistory).filter(
        CostHistory.percent_change > 0
    ).order_by(CostHistory.date.desc()).limit(5).all()

    # Waste this week
    waste_this_week = db.query(func.coalesce(func.sum(WasteLog.total_cost), 0.0)).filter(
        WasteLog.location_id == location_id, func.date(WasteLog.timestamp) >= week_ago
    ).scalar()

    # Deposit Over/Short
    recent_deposits = db.query(Deposit).filter(Deposit.location_id == location_id).order_by(Deposit.business_date.desc()).limit(7).all()
    avg_over_short = sum(float(d.over_short) for d in recent_deposits) / len(recent_deposits) if recent_deposits else 0.0

    return {
        "invoices_needing_review": needs_review_count,
        "invoices_this_week": invoices_this_week,
        "purchases_this_week": float(purchases_this_week),
        "inventory_valuation": float(inventory_valuation),
        "waste_this_week": float(waste_this_week),
        "avg_over_short": round(avg_over_short, 2),
        "recent_price_increases": [
            {
                "item_name": h.inventory_item.name if h.inventory_item else "Item",
                "previous_cost": float(h.previous_cost),
                "unit_cost": float(h.unit_cost),
                "dollar_change": float(h.dollar_change),
                "percent_change": h.percent_change,
                "date": h.date.isoformat()
            } for h in recent_price_increases
        ]
    }
