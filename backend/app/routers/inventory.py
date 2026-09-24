import datetime
import io
import os
import re
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.app.database import get_db, current_location_id, current_organization_id
from backend.app.models import (
    InventoryItem, InventoryCount, InventoryCountLine, InventoryTransaction,
    WasteLog, AuditLog, InventoryCountTemplate, InventoryCountTemplateLine, UnitConversion, Location, ItemAlias
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

def _catalog_item(db, item_id, organization_id=None):
    return db.query(InventoryItem).execution_options(skip_tenant_scope=True).filter(
        InventoryItem.id == item_id,
        InventoryItem.organization_id == (organization_id or current_organization_id.get())
    ).first()

STANDARD_ALIASES = {
    "area": {"area", "area zone"}, "zone": {"zone"}, "item_number": {"item number", "item", "sku"},
    "item_name": {"item name", "name", "description brand"}, "brand": {"brand"}, "item_type": {"item type", "type"},
    "pack_quantity": {"pack qty", "pack quantity"}, "pack_count": {"pack count"}, "pack_unit": {"pack unit"}, "base_unit": {"base unit"}, "unit_size": {"unit size"},
    "count_unit": {"count unit", "count uom", "recipe qty count unit"}, "price": {"price", "cost", "case cost"},
    "use_cs": {"use cs"}, "use_slv": {"use slv"}, "use_pk": {"use pk"}, "use_btl": {"use btl"}, "use_ea": {"use ea"},
    "conv_1_from": {"conv 1 from"}, "conv_1_to": {"conv 1 to"}, "conv_1_qty": {"conv 1 qty"},
    "conv_2_from": {"conv 2 from"}, "conv_2_to": {"conv 2 to"}, "conv_2_qty": {"conv 2 qty"},
    "recipe_unit": {"recipe unit"}, "vendor_pack_size": {"vendor pack size"},
    "canonical_item_name": {"canonical item name"}, "purchase_unit": {"purchase unit"},
    "units_per_purchase_unit": {"units per purchase unit"}, "recipe_units_per_purchase_unit": {"recipe units per purchase unit"},
    "recipe_aliases": {"recipe aliases"}, "conversion_status": {"conversion status"},
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
        sheet_titles = {}
        if "xl/workbook.xml" in book.namelist() and "xl/_rels/workbook.xml.rels" in book.namelist():
            workbook = ET.fromstring(book.read("xl/workbook.xml"))
            rels = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
            relationships = {rel.get("Id"): rel.get("Target") for rel in rels}
            for worksheet in workbook.findall(".//x:sheets/x:sheet", ns):
                rel_id = worksheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                target = relationships.get(rel_id, "")
                if target:
                    path = target.lstrip("/") if target.startswith("/") else f"xl/{target.lstrip('/')}"
                    sheet_titles[path] = worksheet.get("name", "")
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
            yield sheet_titles.get(sheet, sheet.rsplit("/", 1)[-1].removesuffix(".xml")), rows

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
    yield "PDF", [{chr(65 + index): header for index, header in enumerate(headers)}] + rows

def _is_yes(value: str) -> bool:
    return str(value or "").strip().upper() in {"Y", "YES", "TRUE", "1", "X"}

def _decimal(value: str, label: str, item_name: str) -> Decimal:
    try:
        amount = Decimal(str(value).replace("$", "").replace(",", "").strip())
    except Exception:
        raise HTTPException(status_code=400, detail=f"{label} must be a number for {item_name}.")
    if amount <= 0:
        raise HTTPException(status_code=400, detail=f"{label} must be greater than zero for {item_name}.")
    return amount

def _parse_pack_size(value: str):
    """Parse `6/32 FL OZ`, `8 x 5 LB`, or `24 EA` without guessing density."""
    raw = (value or "").strip()
    compact = re.sub(r"\s+", " ", raw.upper()).replace("×", "X")
    match = re.match(r"^(?:(\d+(?:\.\d+)?)\s*(?:/|X)\s*)?(\d+(?:\.\d+)?)\s*(FL\s*OZ|OZ|LB|GAL|QT|PT|ML|L|EA|CT)\b", compact)
    if not match:
        return None
    outer = Decimal(match.group(1) or "1")
    quantity = Decimal(match.group(2))
    unit = re.sub(r"\s+", "_", match.group(3))
    unit = {"CT": "EA"}.get(unit, unit)
    return {"raw": raw, "count": outer, "quantity": quantity, "unit": unit}

def _standard_base_uom(enabled_units, conversions):
    """Use the terminal packaging unit internally without changing count controls."""
    if not conversions:
        return "CS" if "CS" in enabled_units else enabled_units[0]
    sources = {source for source, _, _ in conversions}
    targets = [target for _, target, _ in conversions]
    terminals = [unit for unit in targets if unit not in sources]
    return terminals[-1] if terminals else targets[-1]

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
    standardized_workbook = any(title.strip().casefold() in {"count template", "importer rules"} for title, _ in worksheets)
    count_template_sheet = next(((title, rows) for title, rows in worksheets if title.strip().casefold() == "count template"), None)
    if standardized_workbook and not count_template_sheet:
        raise HTTPException(status_code=400, detail="Reserve standardized workbooks require a Count Template sheet.")
    sheets_to_scan = [count_template_sheet] if count_template_sheet else worksheets
    for _, rows in sheets_to_scan:
        for index, row in enumerate(rows[:25]):
            detected_standard = _standard_columns(row)
            if "item_name" in detected_standard and (standardized_workbook or len(detected_standard) >= 4):
                standard_columns, data = detected_standard, rows[index + 1:]
                break
            labels = {value.lower().strip(): column for column, value in row.items()}
            if any("area" in label or "zone" in label for label in labels) and any("description" in label for label in labels):
                header, data = labels, rows[index + 1:]; break
        if header or standard_columns: break
    if not header and not standard_columns:
        raise HTTPException(status_code=400, detail="No recognizable inventory columns were found. This file does not appear to be a Reserve Standard sheet and Reserve could not confidently identify its inventory columns.")
    enriched_workbook = bool(standard_columns and "canonical_item_name" in standard_columns and "units_per_purchase_unit" in standard_columns)
    if standardized_workbook:
        # Identity is the only universal requirement. Pricing, pack facts,
        # count flags, and conversions are optional item metadata.
        required = {"item_name"}
        missing = sorted(required - set(standard_columns or {}))
        if missing:
            raise HTTPException(status_code=400, detail=f"Count Template is missing required standardized columns: {', '.join(missing)}.")
    def column(*terms):
        return next((col for label, col in header.items() if any(term in label for term in terms)), None)
    area_col, sku_col, desc_col, unit_col = (column("area", "zone"), column("item #", "item number", "sku"), column("description"), column("pack", "unit")) if header else (standard_columns.get("area") or standard_columns.get("zone"), standard_columns.get("item_number"), standard_columns.get("item_name"), standard_columns.get("vendor_pack_size") or standard_columns.get("unit_size") or standard_columns.get("count_unit"))
    created = updated = skipped = 0
    warnings = []
    items_with_cost = items_missing_cost = items_complete_conversions = items_missing_conversions = 0
    template_rows = []
    seen_names, seen_skus = set(), set()
    for row in data:
        # Every optional field has a stable row-local default.  Incomplete
        # source data is a costing concern, never an importer crash.
        enabled_units, conversions, explicit_conversions = [], [], []
        case_cost = current_cost = None
        base_uom = None
        pack = None
        recipe_unit = recipe_quantity = ""
        name, area, sku = row.get(desc_col or "", "").strip(), row.get(area_col or "", "").strip(), row.get(sku_col or "", "").strip()
        if standard_columns:
            zone = row.get(standard_columns.get("zone", ""), "").strip()
            area = " - ".join(part for part in [area, zone] if part)
        if not name:
            skipped += 1; continue
        if not area:
            area = "Unassigned"
            warnings.append({"item": name, "code": "MISSING_AREA", "message": "Item imported without an inventory area."})
        normalized_name, normalized_sku = name.casefold(), sku.casefold()
        # PDFs often repeat the final line of one page at the top of the next.
        # Inventory item names and SKUs are unique, so retain the first row.
        if normalized_name in seen_names or (normalized_sku and normalized_sku in seen_skus):
            skipped += 1; continue
        seen_names.add(normalized_name)
        if normalized_sku: seen_skus.add(normalized_sku)
        catalog = db.query(InventoryItem).execution_options(skip_tenant_scope=True).filter(
            InventoryItem.organization_id == current_organization_id.get())
        item = catalog.filter(InventoryItem.sku == sku).first() if sku else None
        item = item or catalog.filter(InventoryItem.name == name).first()
        unit = row.get(unit_col or "", "").strip()
        if enriched_workbook:
            canonical = (row.get(standard_columns.get("canonical_item_name", ""), "") or "").strip()
            purchase = (row.get(standard_columns.get("purchase_unit", ""), "") or "").strip().upper()
            base_uom = (row.get(standard_columns.get("base_unit", ""), "") or "").strip().upper() or None
            units_text = (row.get(standard_columns.get("units_per_purchase_unit", ""), "") or "").strip()
            raw_price = (row.get(standard_columns.get("price", ""), "") or "").strip()
            name = canonical or name
            enabled_units = [purchase] if purchase else []
            units = _decimal(units_text, "Units Per Purchase Unit", name) if units_text else None
            case_cost = _decimal(raw_price, "Price", name) if raw_price else None
            if purchase and base_uom and units:
                conversions.append((purchase, base_uom, units))
            current_cost = (case_cost / units) if case_cost is not None and units else None
            conversion_status = (row.get(standard_columns.get("conversion_status", ""), "") or "").strip().upper() or None
            if current_cost is None: items_missing_cost += 1; warnings.append({"item": name, "code": "MISSING_COST", "message": "Item imported without a current cost."})
            else: items_with_cost += 1
            if conversions: items_complete_conversions += 1
            else: items_missing_conversions += 1; warnings.append({"item": name, "code": "MISSING_CONVERSION", "message": "Item imported without a usable conversion path."})
            pack = {"count": _decimal((row.get(standard_columns.get("pack_count", ""), "") or "").strip(), "Pack Count", name) if (row.get(standard_columns.get("pack_count", ""), "") or "").strip() else None, "quantity": _decimal((row.get(standard_columns.get("pack_quantity", ""), "") or "").strip(), "Pack Qty", name) if (row.get(standard_columns.get("pack_quantity", ""), "") or "").strip() else None, "unit": (row.get(standard_columns.get("pack_unit", ""), "") or "").strip().upper() or None, "raw": unit}
        elif standardized_workbook:
            enabled_units = [unit_name for unit_name in MULTI_COUNT_UNITS if _is_yes(row.get(standard_columns[f"use_{unit_name.lower()}"] or "", ""))]
            if not enabled_units:
                raise HTTPException(status_code=400, detail=f"At least one Use column must be Y for {name}.")
            for number in (1, 2):
                source = row.get(standard_columns[f"conv_{number}_from"], "").strip().upper()
                target = row.get(standard_columns[f"conv_{number}_to"], "").strip().upper()
                quantity = row.get(standard_columns[f"conv_{number}_qty"], "").strip()
                if any((source, target, quantity)):
                    if not all((source, target, quantity)):
                        raise HTTPException(status_code=400, detail=f"Conv {number} must include From, To, and Qty for {name}.")
                    conversions.append((source, target, _decimal(quantity, f"Conv {number} Qty", name)))
            explicit_conversions = list(conversions)
            recipe_unit = (row.get(standard_columns.get("recipe_unit", ""), "") or "").strip().upper()
            recipe_quantity = (row.get(standard_columns.get("count_unit", ""), "") or "").strip()
            if explicit_conversions and recipe_unit and recipe_quantity:
                recipe_factor = _decimal(recipe_quantity, "Recipe Qty / Count Unit", name)
                source = explicit_conversions[-1][1]
                if source != recipe_unit and (source, recipe_unit) not in {(a, b) for a, b, _ in conversions}:
                    # This is an item-specific conversion supplied by the
                    # standardized template (for example PK -> 3.5 OZ), not a
                    # global cup/weight assumption.
                    conversions.append((source, recipe_unit, recipe_factor))
            base_uom = _standard_base_uom(enabled_units, explicit_conversions)
            pack = _parse_pack_size(row.get(standard_columns.get("vendor_pack_size", ""), ""))
            # Explicit template conversions are authoritative.  Parsed packs
            # only fill missing deterministic links and never invent cups or
            # other density-dependent recipe conversions.
            if pack:
                pairs = {(source, target) for source, target, _ in conversions}
                container = "BTL" if "BTL" in enabled_units else ("SLV" if "SLV" in enabled_units and pack["unit"] == "EA" else None)
                if not container:
                    container = next((target for source, target, factor in explicit_conversions if source == "CS" and factor == pack["count"]), None)
                if not container and explicit_conversions and explicit_conversions[-1][1] in enabled_units:
                    container = explicit_conversions[-1][1]
                if container and ("CS", container) not in pairs:
                    conversions.append(("CS", container, pack["count"]))
                    pairs.add(("CS", container))
                source = container or "CS"
                amount = pack["quantity"] if container else pack["count"] * pack["quantity"]
                if source != pack["unit"] and (source, pack["unit"]) not in pairs:
                    conversions.append((source, pack["unit"], amount))
            # A recipe-unit conversion or parsed package unit is a proven
            # consumable base. Count controls remain independent in
            # enabled_count_units, so changing this does not alter the count UI.
            conversion_targets = {target for _, target, _ in conversions}
            if recipe_unit and recipe_unit in conversion_targets:
                base_uom = recipe_unit
            elif pack and pack["unit"] in conversion_targets:
                base_uom = pack["unit"]
            case_cost_text = row.get(standard_columns["price"], "").strip()
            # Some standardized count rows represent open/prepped inventory and
            # intentionally have no vendor case price.  Blank means "do not
            # replace the known cost", while a supplied value must be numeric.
            case_cost = _decimal(case_cost_text, "Case Cost", name) if case_cost_text else None
            # Current cost is always cost per internal base unit.  Case Cost is
            # authoritative and is never replaced with a guessed zero value.
            case_factor = Decimal("1")
            graph = {}
            for source, target, factor in conversions:
                graph.setdefault(source, []).append((target, factor))
                graph.setdefault(target, []).append((source, Decimal("1") / factor))
            pending, visited = [("CS", Decimal("1"))], set()
            while pending:
                current, factor = pending.pop(0)
                if current in visited: continue
                if current == base_uom:
                    case_factor = factor; break
                visited.add(current)
                pending.extend((next_unit, factor * next_factor) for next_unit, next_factor in graph.get(current, []) if next_unit not in visited)
            current_cost = case_cost / case_factor if case_cost is not None else None
            if current_cost is None:
                items_missing_cost += 1
                warnings.append({"item": name, "code": "MISSING_COST", "message": "Item imported without a current cost."})
            else:
                items_with_cost += 1
            if conversions:
                items_complete_conversions += 1
            else:
                items_missing_conversions += 1
                warnings.append({"item": name, "code": "MISSING_CONVERSION", "message": "Item imported without a usable conversion path."})
        else:
            # Legacy sheets are still valid source documents, but this parser
            # cannot claim structured cost/conversion facts it did not see.
            items_missing_cost += 1
            items_missing_conversions += 1
            warnings.append({"item": name, "code": "MISSING_COST", "message": "Legacy row imported without a structured current cost."})
            warnings.append({"item": name, "code": "MISSING_CONVERSION", "message": "Legacy row imported without structured conversion data."})
        if item:
            item.storage_location = area
            if sku and not item.sku: item.sku = sku
            if standardized_workbook or enriched_workbook:
                item.base_uom, item.count_uom = base_uom, (enabled_units[0] if enabled_units else None)
                item.enabled_count_units, item.purchase_uom = enabled_units or None, (purchase if enriched_workbook else "CS")
                if enriched_workbook: item.conversion_status = conversion_status
                if current_cost is not None:
                    item.current_cost = current_cost
                if pack:
                    item.pack_count, item.pack_unit_quantity = pack["count"], pack["quantity"]
                    item.pack_unit, item.pack_size_raw = pack["unit"], pack["raw"]
                db.query(UnitConversion).filter(UnitConversion.inventory_item_id == item.id).delete()
                for source, target, factor in conversions:
                    db.add(UnitConversion(inventory_item_id=item.id, from_uom=source, to_uom=target, factor=factor))
                if enriched_workbook:
                    db.query(ItemAlias).filter(ItemAlias.inventory_item_id == item.id).delete()
                    for alias in str(row.get(standard_columns.get("recipe_aliases", ""), "")).split(";"):
                        if alias.strip(): db.add(ItemAlias(organization_id=item.organization_id, inventory_item_id=item.id, alias=alias.strip(), normalized_alias=alias.strip().casefold()))
            updated += 1
        else:
            item = InventoryItem(name=name, sku=sku or None, storage_location=area,
                base_uom=base_uom if (standardized_workbook or enriched_workbook) else "EA",
                count_uom=enabled_units[0] if enabled_units else None,
                enabled_count_units=enabled_units or None,
                purchase_uom=(purchase if enriched_workbook else "CS") if (standardized_workbook or enriched_workbook) else unit,
                reporting_uom=base_uom if (standardized_workbook or enriched_workbook) else "EA",
                current_cost=current_cost, category="Food")
            if enriched_workbook: item.conversion_status = conversion_status
            if standardized_workbook and pack:
                item.pack_count, item.pack_unit_quantity = pack["count"], pack["quantity"]
                item.pack_unit, item.pack_size_raw = pack["unit"], pack["raw"]
            db.add(item); db.flush()
            for source, target, factor in conversions:
                db.add(UnitConversion(inventory_item_id=item.id, from_uom=source, to_uom=target, factor=factor))
            created += 1
        template_rows.append((name, sku, area))
    commit_import()
    base_template_name = os.path.splitext(os.path.basename(filename))[0]
    selected_location_id = current_location_id.get()
    location = db.get(Location, selected_location_id) if selected_location_id else None
    # Template names are globally unique in the legacy schema, so make the
    # location explicit rather than failing when the same workbook is loaded
    # into another restaurant.
    template_name = f"{base_template_name} ({location.name})" if location else base_template_name
    template = db.query(InventoryCountTemplate).execution_options(skip_tenant_scope=True).filter(
        InventoryCountTemplate.name == template_name,
        InventoryCountTemplate.location_id == selected_location_id
    ).first()
    if not template:
        template = InventoryCountTemplate(name=template_name); db.add(template); db.flush()
    else:
        template.lines.clear(); db.flush()
    for order, (name, sku, area) in enumerate(template_rows):
        catalog = db.query(InventoryItem).execution_options(skip_tenant_scope=True).filter(
            InventoryItem.organization_id == current_organization_id.get())
        item = catalog.filter(InventoryItem.sku == sku).first() if sku else None
        item = item or catalog.filter(InventoryItem.name == name).first()
        if item:
            db.add(InventoryCountTemplateLine(template_id=template.id, inventory_item_id=item.id, storage_location=area, sort_order=order))
    commit_import()
    return {"success": True, "created": created, "updated": updated, "skipped": skipped,
            "itemsDetected": len(template_rows) + skipped, "itemsImported": created + updated,
            "itemsWithCosts": items_with_cost, "itemsMissingCosts": items_missing_cost,
            "itemsWithCompleteConversions": items_complete_conversions, "itemsMissingConversions": items_missing_conversions,
            "warnings": warnings, "standardized_workbook": standardized_workbook,
            "areas": sorted({area for _, _, area in template_rows}), "template_id": template.id, "template_name": template.name}

@router.get("/count-templates")
def list_count_templates(request: Request, db: Session = Depends(get_db)):
    templates = db.query(InventoryCountTemplate).execution_options(skip_tenant_scope=True).filter(
        InventoryCountTemplate.organization_id == request.state.organization_id,
        InventoryCountTemplate.location_id == request.state.location_id
    ).order_by(InventoryCountTemplate.name).all()
    return [{"id": t.id, "name": t.name, "line_count": len(t.lines)} for t in templates]

@router.get("/count-templates/{template_id}")
def get_count_template(template_id: str, request: Request, db: Session = Depends(get_db)):
    template = db.query(InventoryCountTemplate).execution_options(skip_tenant_scope=True).filter(
        InventoryCountTemplate.id == template_id, InventoryCountTemplate.organization_id == request.state.organization_id,
        InventoryCountTemplate.location_id == request.state.location_id
    ).first()
    if not template: raise HTTPException(status_code=404, detail="Count template not found.")
    item_ids = [line.inventory_item_id for line in template.lines]
    catalog = {item.id: item for item in db.query(InventoryItem).execution_options(skip_tenant_scope=True).filter(
        InventoryItem.organization_id == request.state.organization_id, InventoryItem.id.in_(item_ids)
    ).all()}
    return {"id": template.id, "name": template.name, "lines": [{"id": l.id, "inventory_item_id": l.inventory_item_id, "item_name": catalog[l.inventory_item_id].name, "storage_location": l.storage_location, "current_cost": float(catalog[l.inventory_item_id].current_cost or 0), "sort_order": l.sort_order} for l in sorted(template.lines, key=lambda line: line.sort_order) if l.inventory_item_id in catalog]}

@router.put("/count-templates/{template_id}")
def update_count_template(template_id: str, payload: dict, request: Request, db: Session = Depends(get_db)):
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
    return get_count_template(template_id, request, db)

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
def list_counts(request: Request, db: Session = Depends(get_db)):
    return db.query(InventoryCount).execution_options(skip_tenant_scope=True).filter(
        InventoryCount.organization_id == request.state.organization_id,
        InventoryCount.location_id == request.state.location_id
    ).order_by(InventoryCount.count_date.desc()).all()

@router.get("/counts/{count_id}")
def get_count(count_id: str, request: Request, db: Session = Depends(get_db)):
    count = db.query(InventoryCount).execution_options(skip_tenant_scope=True).filter(
        InventoryCount.id == count_id, InventoryCount.organization_id == request.state.organization_id,
        InventoryCount.location_id == request.state.location_id
    ).first()
    if not count:
        raise HTTPException(status_code=404, detail="Count not found.")
    return {
        "id": count.id, "name": count.name, "status": count.status,
        "lines": [{"inventory_item_id": line.inventory_item_id, "counted_quantity": float(line.counted_quantity), "cs_qty": float(line.cs_qty or 0), "slv_qty": float(line.slv_qty or 0), "pk_qty": float(line.pk_qty or 0), "btl_qty": float(line.btl_qty or 0), "ea_qty": float(line.ea_qty or 0)} for line in count.lines]
    }

@router.post("/counts")
def create_count(count_in: InventoryCountCreate, request: Request, db: Session = Depends(get_db)):
    count = InventoryCount(
        name=count_in.name,
        employee_name=count_in.employee_name,
        location_name=count_in.location_name,
        location_id=request.state.location_id,
        status="Draft",
        notes=count_in.notes
    )
    db.add(count)
    db.flush()

    total_val = Decimal("0.00")
    for line_in in count_in.lines:
        item = _catalog_item(db, line_in.inventory_item_id, request.state.organization_id)
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
def update_count(count_id: str, count_in: InventoryCountCreate, request: Request, db: Session = Depends(get_db)):
    count = db.query(InventoryCount).execution_options(skip_tenant_scope=True).filter(
        InventoryCount.id == count_id, InventoryCount.organization_id == request.state.organization_id,
        InventoryCount.location_id == request.state.location_id
    ).first()
    if not count:
        raise HTTPException(status_code=404, detail="Count not found.")
    if count.status == "Approved":
        raise HTTPException(status_code=400, detail="Approved count sheets cannot be edited.")

    count.name, count.notes = count_in.name, count_in.notes
    count.lines.clear()
    total_val = Decimal("0.00")
    for line_in in count_in.lines:
        item = _catalog_item(db, line_in.inventory_item_id, request.state.organization_id)
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
