"""Staged Business Start import.  Parsed rows are held for review, never imported on upload."""
import csv, io, json, re
from decimal import Decimal
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import InventoryItem, ItemImport, InventoryCountTemplate, InventoryCountTemplateLine
from backend.app.security import require

router = APIRouter(prefix="/api/business-start", tags=["Business Start"])

FIELD_ALIASES = {
    "item_name": ["item name", "product", "product name", "description", "description brand", "name"],
    "category": ["category", "dept", "department"], "subcategory": ["subcategory", "sub category"],
    "storage_location": ["storage", "storage area", "location", "section", "area"],
    "count_uom": ["count unit", "inv unit", "inventory unit", "count uom"],
    "purchase_uom": ["purchase unit", "purchase uom", "buy unit"], "base_uom": ["base unit", "base uom", "unit"],
    "pack_size": ["pack size", "pack"], "case_size": ["case size", "case"], "current_cost": ["cost", "current cost", "price"],
    "quantity": ["quantity", "qty", "on hand", "physical count"], "par_level": ["par", "par level"], "vendor": ["vendor", "supplier"], "vendor_sku": ["vendor sku", "sku", "item #", "item number"],
}

def suggested_mapping(headers):
    normalized = {h: re.sub(r"[^a-z0-9]+", " ", h.strip().lower()).strip() for h in headers}
    def find_column(aliases):
        for raw, norm in normalized.items():
            if norm in aliases: return raw
        # Count sheets commonly decorate otherwise-clear headings: e.g.
        # "Description & Brand", "Area / Zone", and "Pack / Unit Size".
        for raw, norm in normalized.items():
            words = set(norm.split())
            if any(set(alias.split()).issubset(words) for alias in aliases): return raw
        return None
    return {field: find_column(aliases) for field, aliases in FIELD_ALIASES.items()}

def status_for(row):
    if not row.get("item_name"): return "Missing Name"
    if not row.get("count_uom") and not row.get("base_uom"): return "Missing Unit"
    return "Ready"

@router.post("/imports")
async def preview_import(file: UploadFile = File(...), user=Depends(require("items.import")), db: Session = Depends(get_db)):
    filename = file.filename or "inventory-sheet"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    data = await file.read()
    if ext == "csv":
        try: raw_rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
        except UnicodeDecodeError: raise HTTPException(400, "CSV must be UTF-8 encoded")
    elif ext == "xlsx":
        try:
            import openpyxl
            book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            values = list(book.active.values); headers = [str(x or "").strip() for x in values[0]] if values else []
            raw_rows = [dict(zip(headers, ["" if x is None else str(x) for x in row])) for row in values[1:]]
        except ImportError: raise HTTPException(400, "Excel import requires the optional openpyxl package")
        except Exception as exc: raise HTTPException(400, f"Could not read workbook: {exc}")
    elif ext == "xls":
        try:
            import xlrd
            book = xlrd.open_workbook(file_contents=data); sheet = book.sheet_by_index(0)
            headers = [str(x).strip() for x in sheet.row_values(0)] if sheet.nrows else []
            raw_rows = [dict(zip(headers, [str(x) if x is not None else "" for x in sheet.row_values(i)])) for i in range(1, sheet.nrows)]
        except ImportError: raise HTTPException(400, "Legacy Excel import requires the optional xlrd package")
        except Exception as exc: raise HTTPException(400, f"Could not read workbook: {exc}")
    elif ext == "pdf":
        # A PDF has no reliable column structure.  Preserve text for manual mapping/review.
        try:
            from pypdf import PdfReader
            text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages)
            raw_rows = [{"Item Name": line.strip()} for line in text.splitlines() if line.strip()]
        except Exception as exc: raise HTTPException(400, f"Could not extract PDF: {exc}")
    else: raise HTTPException(400, "Upload CSV, XLSX, XLS, or PDF")
    headers = list(raw_rows[0].keys()) if raw_rows else []
    mapping = suggested_mapping(headers)
    rows = []
    for index, source in enumerate(raw_rows):
        row = {field: (source.get(column, "") if column else "") for field, column in mapping.items()}
        row.update({"index": index, "selected": True, "status": status_for(row), "source": source})
        rows.append(row)
    imp = ItemImport(filename=filename, source_type=ext, mapping_json=json.dumps(mapping), rows_json=json.dumps(rows), status="Preview")
    db.add(imp); db.commit(); db.refresh(imp)
    return {"id": imp.id, "filename": filename, "headers": headers, "mapping": mapping, "rows": rows}

@router.put("/imports/{import_id}")
def update_preview(import_id: str, payload: dict, user=Depends(require("items.import")), db: Session = Depends(get_db)):
    imp = db.get(ItemImport, import_id)
    if not imp: raise HTTPException(404, "Import not found")
    rows = payload.get("rows")
    if not isinstance(rows, list): raise HTTPException(400, "Rows are required")
    imp.mapping_json = json.dumps(payload.get("mapping", json.loads(imp.mapping_json or "{}")))
    imp.rows_json = json.dumps(rows); db.commit(); return {"id": imp.id, "rows": rows}

@router.post("/imports/{import_id}/finish")
def finish_import(import_id: str, payload: dict = {}, user=Depends(require("items.import")), db: Session = Depends(get_db)):
    imp = db.get(ItemImport, import_id)
    if not imp: raise HTTPException(404, "Import not found")
    rows = payload.get("rows", json.loads(imp.rows_json)); created = []
    for row in rows:
        if not row.get("selected") or not row.get("item_name", "").strip(): continue
        name = row["item_name"].strip(); existing = db.query(InventoryItem).filter(InventoryItem.name.ilike(name)).first()
        if existing: continue  # preview exposes duplicate; never silently merge or overwrite
        item = InventoryItem(name=name, display_name=name, category=row.get("category") or "Uncategorized", subcategory=row.get("subcategory") or None, storage_location=row.get("storage_location") or "Unassigned", base_uom=row.get("base_uom") or row.get("count_uom") or "EA", count_uom=row.get("count_uom") or row.get("base_uom") or "EA", purchase_uom=row.get("purchase_uom") or None, pack_size=row.get("pack_size") or None, case_size=row.get("case_size") or None, par_level=Decimal(str(row["par_level"])) if row.get("par_level") else None, current_cost=Decimal(str(row["current_cost"])) if row.get("current_cost") else 0, needs_review=row.get("status") != "Ready", created_from_import=True, source_import_id=imp.id)
        db.add(item); db.flush(); created.append(item)
    imp.status = "Imported"; db.commit()
    # Generate one location count sheet using item IDs, ordered by storage area.
    if created:
        template = InventoryCountTemplate(name="Business Start Count Sheet", location_id=imp.location_id)
        db.add(template); db.flush()
        for order, item in enumerate(sorted(created, key=lambda x: (x.storage_location, x.name))):
            db.add(InventoryCountTemplateLine(template_id=template.id, inventory_item_id=item.id, storage_location=item.storage_location, sort_order=order))
        db.commit()
    return {"created": len(created), "count_sheet_created": bool(created)}
