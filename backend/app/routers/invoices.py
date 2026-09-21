import os
import uuid
import datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    Invoice, InvoiceLine, Vendor, VendorItem, InventoryItem,
    InventoryTransaction, CostHistory, AuditLog
)
from backend.app.schemas import InvoiceResponse, InvoiceUpdate
from backend.app.ocr.local_provider import LocalOCRProvider

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
INVOICE_DIR = os.path.join(DATA_DIR, "invoices", "original")
os.makedirs(INVOICE_DIR, exist_ok=True)

@router.get("", response_model=List[InvoiceResponse])
def list_invoices(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Invoice)
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    return query.order_by(Invoice.created_at.desc()).all()

@router.post("/upload", response_model=InvoiceResponse)
async def upload_invoice(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{file_id}{ext}"
    file_path = os.path.join(INVOICE_DIR, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # Run Local OCR Engine
    ocr = LocalOCRProvider()
    ocr_result = ocr.process_file(file_path)

    # Match or Create Vendor
    vendor = db.query(Vendor).filter(Vendor.name == ocr_result.vendor_name.value).first()
    if not vendor and ocr_result.vendor_name.value:
        vendor = Vendor(name=ocr_result.vendor_name.value)
        db.add(vendor)
        db.flush()

    invoice = Invoice(
        id=file_id,
        invoice_number=ocr_result.invoice_number.value,
        vendor_id=vendor.id if vendor else None,
        vendor_name_raw=ocr_result.vendor_name.value,
        invoice_date=ocr_result.invoice_date.value if isinstance(ocr_result.invoice_date.value, datetime.date) else datetime.date.today(),
        subtotal=ocr_result.subtotal.value,
        tax=ocr_result.tax.value,
        total_amount=ocr_result.total_amount.value,
        vendor_confidence=ocr_result.vendor_name.confidence,
        invoice_number_confidence=ocr_result.invoice_number.confidence,
        total_confidence=ocr_result.total_amount.confidence,
        status="Needs Review",
        file_path=file_path,
        raw_ocr_text=ocr_result.raw_text
    )
    db.add(invoice)

    # Add Invoice Lines
    for line in ocr_result.lines:
        inv_line = InvoiceLine(
            invoice_id=invoice.id,
            line_number=line.line_number,
            vendor_sku=line.vendor_sku,
            description=line.description,
            quantity=line.quantity,
            unit_of_measure=line.unit_of_measure,
            pack_size=line.pack_size,
            unit_cost=line.unit_cost,
            extended_cost=line.extended_cost,
            confidence=line.confidence
        )
        
        # Check vendor item mapping suggestion
        if vendor and line.vendor_sku:
            v_item = db.query(VendorItem).filter(
                VendorItem.vendor_id == vendor.id,
                VendorItem.vendor_sku == line.vendor_sku
            ).first()
            if v_item and v_item.mapped_inventory_item_id:
                inv_line.mapped_inventory_item_id = v_item.mapped_inventory_item_id
                inv_line.is_mapped = True

        db.add(inv_line)

    db.commit()
    db.refresh(invoice)
    return invoice

@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return inv

@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(invoice_id: str, update_in: InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    for field, val in update_in.dict(exclude={"lines"}).items():
        if val is not None:
            setattr(inv, field, val)

    if update_in.lines is not None:
        db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice_id).delete()
        for l_in in update_in.lines:
            inv_line = InvoiceLine(
                invoice_id=inv.id,
                line_number=l_in.line_number,
                vendor_sku=l_in.vendor_sku,
                description=l_in.description,
                quantity=l_in.quantity,
                unit_of_measure=l_in.unit_of_measure,
                pack_size=l_in.pack_size,
                unit_cost=l_in.unit_cost,
                extended_cost=l_in.extended_cost,
                confidence=l_in.confidence,
                mapped_inventory_item_id=l_in.mapped_inventory_item_id,
                is_mapped=bool(l_in.mapped_inventory_item_id)
            )
            db.add(inv_line)

    db.commit()
    db.refresh(inv)
    return inv

@router.post("/{invoice_id}/approve", response_model=InvoiceResponse)
def approve_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    if inv.status == "Approved":
        return inv

    inv.status = "Approved"
    inv.approved_at = datetime.datetime.utcnow()
    inv.approved_by = "Manager"

    # Write to inventory ledger & update price cost history
    for line in inv.lines:
        if line.mapped_inventory_item_id:
            item = db.query(InventoryItem).filter(InventoryItem.id == line.mapped_inventory_item_id).first()
            if item:
                prev_cost = item.current_cost or Decimal("0.00")
                new_cost = line.unit_cost
                
                # Update item costs
                item.previous_cost = prev_cost
                item.current_cost = new_cost
                item.last_purchase_cost = new_cost

                dollar_change = new_cost - prev_cost
                pct_change = float((dollar_change / prev_cost * 100)) if prev_cost > 0 else 0.0

                # Record Cost History
                history = CostHistory(
                    inventory_item_id=item.id,
                    vendor_id=inv.vendor_id,
                    invoice_id=inv.id,
                    date=inv.invoice_date or datetime.date.today(),
                    unit_cost=new_cost,
                    previous_cost=prev_cost,
                    dollar_change=dollar_change,
                    percent_change=round(pct_change, 2)
                )
                db.add(history)

                # Record Inventory Ledger Transaction
                tx = InventoryTransaction(
                    inventory_item_id=item.id,
                    transaction_type="Purchase",
                    quantity=line.quantity,
                    uom=line.unit_of_measure or item.purchase_uom or item.base_uom,
                    converted_base_quantity=line.quantity,  # standard base
                    unit_cost=new_cost,
                    extended_cost=line.extended_cost,
                    source="Invoice",
                    reference_id=inv.id,
                    user="Manager",
                    notes=f"Approved Invoice #{inv.invoice_number}"
                )
                db.add(tx)

                # Save or Update Vendor SKU mapping
                if inv.vendor_id and line.vendor_sku:
                    v_item = db.query(VendorItem).filter(
                        VendorItem.vendor_id == inv.vendor_id,
                        VendorItem.vendor_sku == line.vendor_sku
                    ).first()
                    if not v_item:
                        v_item = VendorItem(
                            vendor_id=inv.vendor_id,
                            vendor_sku=line.vendor_sku,
                            description=line.description,
                            unit_of_measure=line.unit_of_measure,
                            current_cost=new_cost,
                            mapped_inventory_item_id=item.id
                        )
                        db.add(v_item)
                    else:
                        v_item.mapped_inventory_item_id = item.id
                        v_item.current_cost = new_cost

    # Audit Log Entry
    audit = AuditLog(
        action="Invoice Approved",
        entity_type="Invoice",
        entity_id=inv.id,
        new_value=f"Approved invoice #{inv.invoice_number} total ${inv.total_amount}"
    )
    db.add(audit)

    db.commit()
    db.refresh(inv)
    return inv

@router.post("/{invoice_id}/reparse", response_model=InvoiceResponse)
def reparse_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    if not inv.file_path or not os.path.exists(inv.file_path):
        raise HTTPException(status_code=400, detail="Original invoice file not found on disk.")

    ocr = LocalOCRProvider()
    ocr_result = ocr.process_file(inv.file_path)

    vendor = db.query(Vendor).filter(Vendor.name == ocr_result.vendor_name.value).first()
    if not vendor and ocr_result.vendor_name.value:
        vendor = Vendor(name=ocr_result.vendor_name.value)
        db.add(vendor)
        db.flush()

    inv.vendor_id = vendor.id if vendor else inv.vendor_id
    inv.vendor_name_raw = ocr_result.vendor_name.value if ocr_result.vendor_name.value != "VENDOR UNKNOWN" else inv.vendor_name_raw
    if ocr_result.invoice_number.value != "N/A":
        inv.invoice_number = ocr_result.invoice_number.value
    if ocr_result.total_amount.value > 0:
        inv.total_amount = ocr_result.total_amount.value
        inv.subtotal = ocr_result.subtotal.value

    inv.raw_ocr_text = ocr_result.raw_text

    # Replace invoice lines with newly parsed lines
    db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice_id).delete()
    for line in ocr_result.lines:
        inv_line = InvoiceLine(
            invoice_id=inv.id,
            line_number=line.line_number,
            vendor_sku=line.vendor_sku,
            description=line.description,
            quantity=line.quantity,
            unit_of_measure=line.unit_of_measure,
            pack_size=line.pack_size,
            unit_cost=line.unit_cost,
            extended_cost=line.extended_cost,
            confidence=line.confidence
        )
        db.add(inv_line)

    db.commit()
    db.refresh(inv)
    return inv

