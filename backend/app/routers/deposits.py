import datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Deposit
from backend.app.schemas import DepositCreate, DepositUpdate

router = APIRouter(prefix="/api/deposits", tags=["Deposits"])

@router.get("")
def list_deposits(db: Session = Depends(get_db)):
    deposits = db.query(Deposit).order_by(Deposit.business_date.desc()).all()
    return [
        {
            "id": d.id,
            "business_date": d.business_date.isoformat(),
            "deposit_date": d.deposit_date.isoformat(),
            "expected_cash": float(d.expected_cash),
            "actual_cash": float(d.actual_cash),
            "deposit_amount": float(d.deposit_amount),
            "over_short": float(d.over_short),
            "deposit_reference": d.deposit_reference,
            "bank_reference": d.bank_reference,
            "manager": d.manager,
            "status": d.status,
            "notes": d.notes,
            "created_at": d.created_at.isoformat()
        } for d in deposits
    ]

@router.post("")
def create_deposit(deposit_in: DepositCreate, db: Session = Depends(get_db)):
    over_short = deposit_in.actual_cash - deposit_in.expected_cash

    deposit = Deposit(
        business_date=deposit_in.business_date,
        deposit_date=deposit_in.deposit_date,
        expected_cash=deposit_in.expected_cash,
        actual_cash=deposit_in.actual_cash,
        deposit_amount=deposit_in.deposit_amount,
        over_short=over_short,
        deposit_reference=deposit_in.deposit_reference,
        bank_reference=deposit_in.bank_reference,
        manager=deposit_in.manager or "Manager",
        status="Open",
        notes=deposit_in.notes
    )
    db.add(deposit)
    db.commit()
    db.refresh(deposit)

    return {
        "id": deposit.id,
        "business_date": deposit.business_date.isoformat(),
        "deposit_date": deposit.deposit_date.isoformat(),
        "expected_cash": float(deposit.expected_cash),
        "actual_cash": float(deposit.actual_cash),
        "deposit_amount": float(deposit.deposit_amount),
        "over_short": float(deposit.over_short),
        "status": deposit.status
    }

