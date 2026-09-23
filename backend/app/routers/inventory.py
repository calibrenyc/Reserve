import datetime
import io
import os
import re
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.app.database import get_db
from backend.app.models import (
    InventoryItem, InventoryCount, InventoryCountLine, InventoryTransaction,
    WasteLog, AuditLog, InventoryCountTemplate, InventoryCountTemplateLine
)
from backend.app.schemas import InventoryCountCreate, WasteLogCreate
from backend.app.services.avt_engine import AvTEngine

router = APIRouter(prefix="/api/inventory", tags=["Inventory Management"])

MULTI_COUNT_UNITS = ("CS", "SLV", "PK", "BTL", "EA")

def _multi_unit_base_quantity(db, item, line_in):
    quantities = {unit: Decimal(str(getattr(line_in, f"{unit.lower()}_qty", None) or 0)) for unit in MULTI_COUNT_UNITS}
    if not any(quantities.values()): quantities[line_in.counted_uom.upper()] = Decimal(str(line_in.counted_quantity))
    base_qty = sum((qty * AvTEngine.get_unit_conversion_factor(db, item.id, unit, item.base_uom) for unit, qty in quantities.items()), Decimal("0"))
    return base_qty, quantities

STANDARD_ALIASES = {
    "area": {"area"}, "zone": {"zone"}, "item_number": {"item number", "item", "sku"},
    "item_name": {"item name", "name"}, "brand": {"brand"}, "item_type": {"item type", "type"},
    "pack_quantity": {"pack qty", "pack quantity"}, "unit_size": {"unit size"},
    "count_unit": {"count unit", "count uom"}, "price": {"price", "cost"},
    "sort_order": {"sort order", "sort"}, "active": {"active"},
}

def _normalized_header(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
    return "item number" if value in {"item", "item no", "item num"} else value

def _standard_columns(row):
    columns = {}
    for column, value in row.items():
        normalized = _normalized_header(str(value))
        for field, aliases in STANDARD_ALIASES.items():
            if normalized in aliases: columns[field] = column
    return columns

def _xlsx_rows(contents: bytes):
    """Read simple worksheet cells without requiring Excel on the server."""
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(contents)) as book:
        shared = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            shared = ["".join(node.itertext()) for node in root.findall("x:si", ns)]
        sheets = [name for name in book.namelist() if name.startswith("xl/worksheets/") and name.endswith(".xml")]
        for sheet in sheets:
            root = ET.fromstring(book.read(sheet)); rows = []
            for row in root.findall(".//x:sheetData/x:row", ns):
                values = {}
                for cell in row.findall("x:c", ns):
                    ref = cell.get("r", "A1"); column = re.match(r"[A-Z]+", ref).group(0)
                    value = cell.find("x:v", ns)
                    inline = cell.find("x:is", ns)
                    text = "".join(inline.itertext()) if inline is not None else (value.text if value is not None else "")
                    if cell.get("t") == "s" and text:
                        text = shared[int(text)]
                    values[column] = str(text).strip()
                if values: rows.append(values)
            yield rows

def _pdf_rows(contents: bytes):
    """Extract simple tabular rows from a text-based count-sheet PDF."""
    try:
        from pypdf import PdfReader
        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(contents)).pages)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {error}")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    header_index = next((index for index, line in enumerate(lines) if re.search(r"(?:area|zone)", line, re.I) and re.search(r"description", line, re.I)), None)
    if header_index is None:
        raise HTTPException(status_code=400, detail="Could not find Area/Zone and Description headers in this PDF. Use a text-based PDF or upload the original Excel file.")
    headers = [value.strip() for value in re.split(r"\t+|\s{2,}|\s*\|\s*", lines[header_index]) if value.strip()]
    rows = []
    for line in lines[header_index + 1:]:
        if re.search(r"(?:area|zone)", line, re.I) and re.search(r"description", line, re.I):
            continue
        values = [value.strip() for value in re.split(r"\t+|\s{2,}|\s*\|\s*", line) if value.strip()]
        if len(values) >= len(headers):
            rows.append({chr(65 + index): value for index, value in enumerate(values[:len(headers)])})
    if not rows:
        raise HTTPException(status_code=400, detail="No count-sheet rows could be read from this PDF. Use a text-based PDF with table columns, or upload the original Excel file.")
    yield [{chr(65 + index): header for index, header in enumerate(headers)}] + rows

@router.post("/count-sheet-template/import")
async def import_count_sheet_template(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = file.filename or "count-sheet"
    extension = os.path.splitext(filename)[1].lower()
    if extension not in {".xlsx", ".pdf"}:
        raise HTTPException(status_code=400, detail="Upload an .xlsx or text-based .pdf count sheet template.")
    def commit_import():
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="The PDF contains duplicate item names or SKUs. Correct the duplicate rows, then import again.")
        except Exception as error:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Count-sheet import could not be saved: {error}")
    try:
        contents = await file.read()
        worksheets = list(_xlsx_rows(contents)) if extension == ".xlsx" else list(_pdf_rows(contents))
    except (zipfile.BadZipFile, ET.ParseError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"Could not read workbook: {error}")
    header = data = standard_columns = None
    for rows in worksheets:
        for index, row in enumerate(rows[:25]):
            detected_standard = _standard_columns(row)
            if "item_name" in detected_standard and len(detected_standard) >= 4:
                standard_columns, data = detected_standard, rows[index + 1:]
                break
            labels = {value.lower().strip(): column for column, value in row.items()}
            if any("area" in label or "zone" in label for label in labels) and any("description" in label for label in labels):
                header, data = labels, rows[index + 1:]; break
        if header or standard_columns: break
    if not header and not standard_columns:
        raise HTTPException(status_code=400, detail="No recognizable inventory columns were found. This file does not appear to be a Reserve Standard sheet and Reserve could not confidently identify its inventory columns.")
    def column(*terms):
        return next((col for label, col in header.items() if any(term in label for term in terms)), None)
    area_col, sku_col, desc_col, unit_col = (column("area", "zone"), column("item #", "item number", "sku"), column("description"), column("pack", "unit")) if header else (standard_columns.get("area") or standard_columns.get("zone"), standard_columns.get("item_number"), standard_columns.get("item_name"), standard_columns.get("count_unit") or standard_columns.get("unit_size"))
    created = updated = skipped = 0
    template_rows = []
    seen_names, seen_skus = set(), set()
    for row in data:
        name, area, sku = row.get(desc_col or "", "").strip(), row.get(area_col or "", "").strip(), row.get(sku_col or "", "").strip()
        if standard_columns:
            zone = row.get(standard_columns.get("zone", ""), "").strip()
            area = " - ".join(part for part in [area, zone] if part)
        if not name or not area:
            skipped += 1; continue
        normalized_name, normalized_sku = name.casefold(), sku.casefold()
        # PDFs often repeat the final line of one page at the top of the next.
        # Inventory item names and SKUs are unique, so retain the first row.
        if normalized_name in seen_names or (normalized_sku and normalized_sku in seen_skus):
            skipped += 1; continue
        seen_names.add(normalized_name)
        if normalized_sku: seen_skus.add(normalized_sku)
        item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first() if sku else None
        item = item or db.query(InventoryItem).filter(InventoryItem.name == name).first()
        unit = row.get(unit_col or "", "").strip() or "EA"
        if item:
            item.storage_location = area
            if sku and not item.sku: item.sku = sku
            updated += 1
        else:
            db.add(InventoryItem(name=name, sku=sku or None, storage_location=area, base_uom="EA", purchase_uom=unit, reporting_uom="EA", category="Food"))
            created += 1
        template_rows.append((name, sku, area))
    commit_import()
    template_name = os.path.splitext(os.path.basename(filename))[0]
    template = db.query(InventoryCountTemplate).filter(InventoryCountTemplate.name == template_name).first()
    if not template:
        template = InventoryCountTemplate(name=template_name); db.add(template); db.flush()
    else:
        template.lines.clear(); db.flush()
    for order, (name, sku, area) in enumerate(template_rows):
        item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first() if sku else None
        item = item or db.query(InventoryItem).filter(InventoryItem.name == name).first()
        if item:
            db.add(InventoryCountTemplateLine(template_id=template.id, inventory_item_id=item.id, storage_location=area, sort_order=order))
    commit_import()
    return {"created": created, "updated": updated, "skipped": skipped, "areas": sorted({area for _, _, area in template_rows}), "template_id": template.id, "template_name": template.name}

@router.get("/count-templates")
def list_count_templates(db: Session = Depends(get_db)):
    return [{"id": t.id, "name": t.name, "line_count": len(t.lines)} for t in db.query(InventoryCountTemplate).order_by(InventoryCountTemplate.name).all()]

@router.get("/count-templates/{template_id}")
def get_count_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(InventoryCountTemplate).filter(InventoryCountTemplate.id == template_id).first()
    if not template: raise HTTPException(status_code=404, detail="Count template not found.")
    return {"id": template.id, "name": template.name, "lines": [{"id": l.id, "inventory_item_id": l.inventory_item_id, "item_name": l.inventory_item.name, "storage_location": l.storage_location, "current_cost": float(l.inventory_item.current_cost or 0), "sort_order": l.sort_order} for l in sorted(template.lines, key=lambda line: line.sort_order)]}

@router.put("/count-templates/{template_id}")
def update_count_template(template_id: str, payload: dict, db: Session = Depends(get_db)):
    template = db.query(InventoryCountTemplate).filter(InventoryCountTemplate.id == template_id).first()
    if not template: raise HTTPException(status_code=404, detail="Count template not found.")
    template.name = payload.get("name", template.name)
    # Keep template-area and cost changes in one transaction.  Saving costs one
    # HTTP request at a time can overwhelm SQLite for large count sheets.
    for line in payload.get("lines", []):
        item = db.query(InventoryItem).filter(InventoryItem.id == line.get("inventory_item_id")).first()
        if item and "current_cost" in line:
            try:
                cost = Decimal(str(line["current_cost"]))
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid cost for {item.name}.")
            if cost < 0:
                raise HTTPException(status_code=400, detail=f"Cost cannot be negative for {item.name}.")
            item.current_cost = cost
    template.lines.clear(); db.flush()
    for order, line in enumerate(payload.get("lines", [])):
        if db.query(InventoryItem).filter(InventoryItem.id == line.get("inventory_item_id")).first():
            db.add(InventoryCountTemplateLine(template_id=template.id, inventory_item_id=line["inventory_item_id"], storage_location=line.get("storage_location") or "Unassigned", sort_order=order))
    db.commit()
    return get_count_template(template_id, db)

@router.delete("/count-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_count_template(template_id: str, db: Session = Depends(get_db)):
    """Remove the reusable spreadsheet template without deleting inventory items."""
    template = db.query(InventoryCountTemplate).filter(InventoryCountTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Count template not found.")
    db.delete(template)
    db.commit()

@router.post("/count-templates/{template_id}/sync-items")
def sync_count_template_items(template_id: str, db: Session = Depends(get_db)):
    """Make a template contain every active item in the item master."""
    template = db.query(InventoryCountTemplate).filter(InventoryCountTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Count template not found.")
    items = db.query(InventoryItem).filter(InventoryItem.is_active == True).order_by(InventoryItem.storage_location, InventoryItem.name).all()
    template.lines.clear()
    db.flush()
    for order, item in enumerate(items):
        db.add(InventoryCountTemplateLine(
            template_id=template.id,
            inventory_item_id=item.id,
            storage_location=item.storage_location or "Unassigned",
            sort_order=order,
        ))
    db.commit()
    return {"template_id": template.id, "template_name": template.name, "line_count": len(items)}

@router.get("/counts")
def list_counts(db: Session = Depends(get_db)):
    return db.query(InventoryCount).order_by(InventoryCount.count_date.desc()).all()

@router.get("/counts/{count_id}")
def get_count(count_id: str, db: Session = Depends(get_db)):
    count = db.query(InventoryCount).filter(InventoryCount.id == count_id).first()
    if not count:
        raise HTTPException(status_code=404, detail="Count not found.")
    return {
        "id": count.id, "name": count.name, "status": count.status,
        "lines": [{"inventory_item_id": line.inventory_item_id, "counted_quantity": float(line.counted_quantity), "cs_qty": float(line.cs_qty or 0), "slv_qty": float(line.slv_qty or 0), "pk_qty": float(line.pk_qty or 0), "btl_qty": float(line.btl_qty or 0), "ea_qty": float(line.ea_qty or 0)} for line in count.lines]
    }

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
        base_qty, quantities = _multi_unit_base_quantity(db, item, line_in)
        ext_val = base_qty * unit_cost

        count_line = InventoryCountLine(
            count_id=count.id,
            inventory_item_id=item.id,
            storage_location=line_in.storage_location,
            counted_quantity=line_in.counted_quantity,
            counted_uom=line_in.counted_uom,
            base_quantity=base_qty,
            unit_cost=unit_cost,
            extended_value=ext_val,
            cs_qty=quantities["CS"], slv_qty=quantities["SLV"], pk_qty=quantities["PK"], btl_qty=quantities["BTL"], ea_qty=quantities["EA"]
        )
        db.add(count_line)
        total_val += ext_val

    count.total_valuation = total_val
    db.commit()
    db.refresh(count)
    return count

@router.put("/counts/{count_id}")
def update_count(count_id: str, count_in: InventoryCountCreate, db: Session = Depends(get_db)):
    count = db.query(InventoryCount).filter(InventoryCount.id == count_id).first()
    if not count:
        raise HTTPException(status_code=404, detail="Count not found.")
    if count.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved count sheets cannot be edited.")

    count.name, count.notes = count_in.name, count_in.notes
    count.lines.clear()
    total_val = Decimal("0.00")
    for line_in in count_in.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line_in.inventory_item_id).first()
        if not item:
            continue
        unit_cost = item.current_cost or Decimal("0.00")
        base_qty, quantities = _multi_unit_base_quantity(db, item, line_in)
        ext_val = base_qty * unit_cost
        db.add(InventoryCountLine(count_id=count.id, inventory_item_id=item.id, storage_location=line_in.storage_location,
            counted_quantity=line_in.counted_quantity, counted_uom=line_in.counted_uom, base_quantity=base_qty,
            unit_cost=unit_cost, extended_value=ext_val, cs_qty=quantities["CS"], slv_qty=quantities["SLV"], pk_qty=quantities["PK"], btl_qty=quantities["BTL"], ea_qty=quantities["EA"]))
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

@router.delete("/waste/{waste_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_waste_log(waste_id: str, db: Session = Depends(get_db)):
    waste = db.query(WasteLog).filter(WasteLog.id == waste_id).first()
    if not waste:
        raise HTTPException(status_code=404, detail="Waste entry not found.")
    db.query(InventoryTransaction).filter(
        InventoryTransaction.source == "Waste Log",
        InventoryTransaction.reference_id == waste.id,
    ).delete(synchronize_session=False)
    db.delete(waste)
    db.add(AuditLog(action="Waste Entry Deleted", entity_type="WasteLog", entity_id=waste_id, original_value=f"{waste.quantity} {waste.uom}: {waste.reason}"))
    db.commit()

