import csv
import hashlib
import io
import datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import SalesImport, SalesLine, Recipe

router = APIRouter(prefix="/api/sales", tags=["Sales PMIX"])

@router.get("/imports")
def list_sales_imports(db: Session = Depends(get_db)):
    return db.query(SalesImport).order_by(SalesImport.import_date.desc()).all()

@router.post("/import")
async def import_sales_pmix(
    file: UploadFile = File(...),
    business_date_str: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    contents = await file.read()
    file_hash = hashlib.sha256(contents).hexdigest()

    existing = db.query(SalesImport).filter(SalesImport.file_hash == file_hash).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate PMIX import detected! File '{file.filename}' was already imported on {existing.import_date.strftime('%Y-%m-%d %H:%M')}."
        )

    b_date = datetime.date.today()
    if business_date_str:
        try:
            b_date = datetime.datetime.strptime(business_date_str, "%Y-%m-%d").date()
        except Exception:
            pass

    text_content = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text_content))

    sales_import = SalesImport(
        filename=file.filename,
        file_hash=file_hash,
        business_date=b_date,
        total_records=0,
        total_net_sales=Decimal("0.00")
    )
    db.add(sales_import)
    db.flush()

    total_records = 0
    total_net_sales = Decimal("0.00")

    for row in reader:
        # Flexible header mapping
        menu_item_name = row.get("Menu Item") or row.get("Item Name") or row.get("Description") or row.get("Item") or ""
        if not menu_item_name:
            continue

        pos_id = row.get("POS Item ID") or row.get("Item ID") or row.get("SKU") or ""
        qty_str = row.get("Quantity Sold") or row.get("Qty") or row.get("Quantity") or "1"
        sales_str = row.get("Net Sales") or row.get("Sales") or row.get("Amount") or "0.00"

        try:
            qty = Decimal(str(qty_str).replace(",", ""))
            net_sales = Decimal(str(sales_str).replace(",", "").replace("$", ""))
        except Exception:
            qty = Decimal("1")
            net_sales = Decimal("0.00")

        # Attempt to map to existing Recipe
        recipe = db.query(Recipe).filter(
            (Recipe.name.ilike(menu_item_name.strip())) | (Recipe.pos_identifier == pos_id)
        ).first()

        s_line = SalesLine(
            sales_import_id=sales_import.id,
            business_date=b_date,
            pos_item_id=pos_id,
            menu_item_name=menu_item_name.strip(),
            recipe_id=recipe.id if recipe else None,
            quantity_sold=qty,
            net_sales=net_sales
        )
        db.add(s_line)

        total_records += 1
        total_net_sales += net_sales

    sales_import.total_records = total_records
    sales_import.total_net_sales = total_net_sales

    db.commit()
    db.refresh(sales_import)

    return {
        "message": "Sales PMIX imported successfully",
        "import_id": sales_import.id,
        "total_records": total_records,
        "total_net_sales": float(total_net_sales)
    }

