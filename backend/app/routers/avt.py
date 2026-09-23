import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.services.avt_engine import AvTEngine

router = APIRouter(prefix="/api/reports/avt", tags=["Actual vs Theoretical"])

@router.get("")
def get_avt_report(
    request: Request,
    start_date_str: Optional[str] = None,
    end_date_str: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=7)

    if start_date_str:
        try:
            start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
        except Exception:
            pass

    if end_date_str:
        try:
            end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
        except Exception:
            pass

    return AvTEngine.calculate_avt(db, start_date, end_date, category_filter=category, location_id=request.state.location_id)
