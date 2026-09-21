import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.database import get_db
from backend.app.models import (
    Invoice, InventoryItem, InventoryCount, WasteLog, Deposit, CostHistory
)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    today = datetime.date.today()
    week_ago = today - datetime.timedelta(days=7)

    # Invoices needing review
    needs_review_count = db.query(Invoice).filter(Invoice.status == "Needs Review").count()
    invoices_this_week = db.query(Invoice).filter(func.date(Invoice.created_at) >= week_ago).count()
    purchases_this_week = db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0)).filter(
        func.date(Invoice.created_at) >= week_ago,
        Invoice.status == "Approved"
    ).scalar()

    # Inventory Valuation
    items = db.query(InventoryItem).filter(InventoryItem.is_active == True).all()
    inventory_valuation = sum(float(i.current_cost or 0.0) * 10.0 for i in items)  # Estimated total inventory valuation

    # Recent Price Increases
    recent_price_increases = db.query(CostHistory).filter(
        CostHistory.percent_change > 0
    ).order_by(CostHistory.date.desc()).limit(5).all()

    # Waste this week
    waste_this_week = db.query(func.coalesce(func.sum(WasteLog.total_cost), 0.0)).filter(
        func.date(WasteLog.timestamp) >= week_ago
    ).scalar()

    # Deposit Over/Short
    recent_deposits = db.query(Deposit).order_by(Deposit.business_date.desc()).limit(7).all()
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

