import os
import uuid
import datetime
import json
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    Invoice, InvoiceLine, Vendor, VendorItem, InventoryItem,
    InventoryTransaction, CostHistory, AuditLog
)
from backend.app.schemas import InvoiceResponse, InvoiceUpdate
from backend.app.ocr.local_provider import LocalOCRProvider
from backend.app.services.invoice_pipeline import InvoiceImportPipeline

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])

def api_invoice(inv: Invoice):
    """The exact review payload using saved database values."""
    return InvoiceResponse.from_orm(inv).dict()

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
INVOICE_DIR = os.path.join(DATA_DIR, "invoices", "original")
os.makedirs(INVOICE_DIR, exist_ok=True)

@router.get("", response_model=List[InvoiceResponse])
def list_invoices(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Invoice)
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    return [api_invoice(inv) for inv in query.order_by(Invoice.created_at.desc()).all()]

@router.post("/upload", response_model=InvoiceResponse)
async def upload_invoice(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{file_id}{ext}"
    file_path = os.path.join(INVOICE_DIR, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # OCR supplies evidence only; layout/parser/validator are independent stages.
    result = InvoiceImportPipeline().run(LocalOCRProvider().process_document(file_path))
    # Baseline mode intentionally does not interpret OCR into vendor/header fields.
    header, vendor = result["header"], None

    invoice = Invoice(
        id=file_id,
        invoice_number=header.get("invoice_number"),
        vendor_id=vendor.id if vendor else None,
        vendor_name_raw=None, invoice_date=None,
        subtotal=header.get("subtotal") or Decimal("0"), tax=header.get("tax") or Decimal("0"), delivery_fees=header.get("freight") or Decimal("0"), total_amount=header.get("grand_total") or Decimal("0"),
        vendor_confidence=0.0, invoice_number_confidence=95.0 if header.get("invoice_number") else 0.0, total_confidence=95.0 if header.get("grand_total") else 0.0,
        status="Needs Review",
        file_path=file_path,
        raw_ocr_text=result["debug"]["raw_ocr"], pipeline_debug=json.dumps(result["debug"], default=str)
    )
    db.add(invoice)

    # Add Invoice Lines
    for line in result["lines"]:
        inv_line = InvoiceLine(
            invoice_id=invoice.id,
            debug_id=line["debug_id"],
            line_number=line["line_number"],
            vendor_sku=line["vendor_sku"],
            description=line["description"] or "(missing description)",
            quantity=line["quantity"],
            unit_of_measure=line["unit_of_measure"],
            pack_size=line["pack_size"],
            unit_cost=line["unit_cost"],
            extended_cost=line["extended_cost"],
            confidence=min((v for v in line["field_confidence"].values() if v is not None), default=0),
            field_confidence=json.dumps(line["field_confidence"]),
            validation_status=line["validation_status"],
            source_boxes=json.dumps(line["source_boxes"])
        )
        
        # Check vendor item mapping suggestion
        db.add(inv_line)

    db.commit()
    db.refresh(invoice)
    payload = api_invoice(invoice)
    # Full raw evidence is persisted in pipeline_debug and available through the
    # debug endpoint. Avoid dumping thousands of boxes to the server console,
    # which can freeze a local terminal during an OCR run.
    print(f"INVOICE_DEBUG stored: {len(result['debug']['raw_ocr_tokens'])} OCR tokens, {len(result['debug']['grouped_line_item_rows'])} grouped rows")
    return payload

@router.get("/{invoice_id}/debug")
def get_invoice_debug(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv: raise HTTPException(status_code=404, detail="Invoice not found.")
    debug = json.loads(inv.pipeline_debug or "{}")
    debug["frontend_api_payload"] = api_invoice(inv)
    return debug

@router.get("/file/{invoice_id}")
def get_invoice_file(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or not inv.file_path or not os.path.exists(inv.file_path):
        raise HTTPException(status_code=404, detail="Invoice file not found.")
    ext = os.path.splitext(inv.file_path)[1].lower()
    content_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".heic": "image/heic",
        ".webp": "image/webp"
    }
    media_type = content_types.get(ext, "application/octet-stream")
    return FileResponse(inv.file_path, media_type=media_type)

@router.get("/processed-file/{invoice_id}")
def get_processed_invoice_file(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    # The sidecar is generated for OCR and never replaces the user upload.
    processed = f"{inv.file_path}.ocr.png" if inv and inv.file_path else None
    if not processed or not os.path.exists(processed):
        raise HTTPException(status_code=404, detail="Processed OCR image not available.")
    return FileResponse(processed, media_type="image/png")

@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return api_invoice(inv)

@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(invoice_id: str, update_in: InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    update_data = update_in.dict(exclude={"lines"}, exclude_unset=True)
    for field, val in update_data.items():
        setattr(inv, field, val)

    if update_in.lines is not None:
        inv.lines.clear()
        db.flush()
        for l_in in update_in.lines:
            inv_line = InvoiceLine(
                invoice_id=inv.id,
                line_number=l_in.line_number,
                vendor_sku=l_in.vendor_sku,
                description=l_in.description or "(missing description)",
                debug_id=l_in.debug_id,
                quantity=l_in.quantity,
                unit_of_measure=l_in.unit_of_measure,
                pack_size=l_in.pack_size,
                unit_cost=l_in.unit_cost,
                extended_cost=l_in.extended_cost,
                confidence=l_in.confidence,
                field_confidence=l_in.field_confidence,
                validation_status=l_in.validation_status or "Verified",
                source_boxes=l_in.source_boxes,
                mapped_inventory_item_id=l_in.mapped_inventory_item_id,
                is_mapped=bool(l_in.mapped_inventory_item_id)
            )
            inv.lines.append(inv_line)

    db.commit()
    db.expire_all()
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    return api_invoice(inv)

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

                # Save mapping memory even where a vendor has no printed SKU.
                # Description + pack is the stable key used by the import
                # pipeline, with exact history taking precedence over fuzzy match.
                if inv.vendor_id and (line.vendor_sku or line.description):
                    mapping_key = line.vendor_sku or line.description
                    v_item = db.query(VendorItem).filter(
                        VendorItem.vendor_id == inv.vendor_id,
                        VendorItem.vendor_sku == mapping_key
                    ).first()
                    if not v_item:
                        v_item = VendorItem(
                            vendor_id=inv.vendor_id,
                            vendor_sku=mapping_key,
                            description=line.description,
                            pack_size=line.pack_size,
                            unit_of_measure=line.unit_of_measure,
                            current_cost=new_cost,
                            mapped_inventory_item_id=item.id
                        )
                        db.add(v_item)
                    else:
                        v_item.mapped_inventory_item_id = item.id
                        v_item.current_cost = new_cost
                        v_item.description = line.description
                        v_item.pack_size = line.pack_size

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
    return api_invoice(inv)

@router.post("/{invoice_id}/unlock", response_model=InvoiceResponse)
def unlock_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    inv.status = "Needs Review"
    inv.approved_at = None
    inv.approved_by = None
    
    # Audit Log Entry
    audit = AuditLog(
        action="Invoice Unlocked",
        entity_type="Invoice",
        entity_id=inv.id,
        new_value=f"Unlocked invoice #{inv.invoice_number or inv.id} for editing"
    )
    db.add(audit)

    db.commit()
    db.refresh(inv)
    return api_invoice(inv)

@router.post("/{invoice_id}/reparse", response_model=InvoiceResponse)
def reparse_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    if not inv.file_path or not os.path.exists(inv.file_path):
        raise HTTPException(status_code=400, detail="Original invoice file not found on disk.")

    # Reparse uses the same transparent spatial baseline as a new upload. It
    # intentionally does not populate header totals or invent corrected values.
    result = InvoiceImportPipeline().run(LocalOCRProvider().process_document(inv.file_path))
    header = result["header"]
    inv.raw_ocr_text = result["debug"]["raw_ocr"]
    inv.pipeline_debug = json.dumps(result["debug"], default=str)
    inv.vendor_name_raw = None
    inv.invoice_number = header.get("invoice_number")
    inv.invoice_date = None
    inv.subtotal = header.get("subtotal") or Decimal("0")
    inv.tax = header.get("tax") or Decimal("0")
    inv.delivery_fees = header.get("freight") or Decimal("0")
    inv.total_amount = header.get("grand_total") or Decimal("0")
    db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice_id).delete()
    for line in result["lines"]:
        db.add(InvoiceLine(
            invoice_id=inv.id,
            debug_id=line["debug_id"],
            line_number=line["line_number"],
            vendor_sku=None,
            description=line["description"] or "(missing description)",
            quantity=line["quantity"],
            unit_of_measure=line["unit_of_measure"],
            pack_size=None,
            unit_cost=line["unit_cost"],
            extended_cost=line["extended_cost"],
            confidence=0,
            field_confidence=json.dumps(line["field_confidence"]),
            validation_status=line["validation_status"],
            source_boxes=json.dumps(line["source_boxes"])
        ))
    db.commit()
    db.refresh(inv)
    payload = api_invoice(inv)
    # The complete raw/debug payload remains stored with the invoice; do not
    # synchronously print it because console rendering causes severe lag.
    print(f"INVOICE_DEBUG stored: {len(result['debug']['raw_ocr_tokens'])} OCR tokens, {len(result['debug']['grouped_line_item_rows'])} grouped rows")
    return payload

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
    if ocr_result.po_number.value:
        inv.po_number = ocr_result.po_number.value
    if ocr_result.total_amount.value > 0:
        inv.total_amount = ocr_result.total_amount.value
        inv.subtotal = ocr_result.subtotal.value
        inv.tax = ocr_result.tax.value
        inv.delivery_fees = ocr_result.delivery_fees.value

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
    return api_invoice(inv)


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    # Unlink any cost history references before deleting
    db.query(CostHistory).filter(CostHistory.invoice_id == invoice_id).update({CostHistory.invoice_id: None})

    # Delete associated invoice lines
    db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice_id).delete()

    # Delete physical file from disk if present
    if inv.file_path and os.path.exists(inv.file_path):
        try:
            os.remove(inv.file_path)
        except Exception as e:
            print(f"Warning: Could not remove physical invoice file: {e}")

    # Delete invoice record
    db.delete(inv)
    db.commit()

    return {"status": "success", "message": f"Invoice {invoice_id} deleted successfully.", "id": invoice_id}


