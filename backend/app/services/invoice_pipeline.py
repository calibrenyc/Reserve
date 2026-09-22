"""Generic, inspectable spatial invoice-table reconstruction. No OCR correction."""
from __future__ import annotations
from dataclasses import asdict, dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional
import re

@dataclass
class Token:
    text: str; confidence: float; page: int; box: List[float]
    @property
    def cx(self): return self.box[0] + self.box[2] / 2
    @property
    def cy(self): return self.box[1] + self.box[3] / 2

@dataclass
class OCRDocument:
    raw_text: str; tokens: List[Token] = field(default_factory=list); pages: int = 1; processed_file_path: str | None = None

HEADER_WORDS = {
    "description": ("description", "item", "sku", "item number"),
    "quantity": ("qty", "quantity", "order quantity", "ship quantity"),
    "uom": ("uom", "pack"),
    "unit_price": ("unit price", "price", "cost"),
    "line_total": ("extended price", "extended", "amount", "total"),
}

def estimate_row_slope(tokens: List[Token]) -> float:
    """Estimate page skew from repeated numeric columns without fixed positions."""
    numeric_tokens = [t for t in tokens if numeric(t.text) is not None]
    if len(numeric_tokens) < 8: return 0.0
    xs = sorted(t.cx for t in numeric_tokens)
    left_cut, right_cut = xs[len(xs)//4], xs[(len(xs)*3)//4]
    left = sorted((t for t in numeric_tokens if t.cx <= left_cut), key=lambda t: t.cy)
    right = sorted((t for t in numeric_tokens if t.cx >= right_cut), key=lambda t: t.cy)
    if min(len(left), len(right)) < 4: return 0.0
    # Pair rank-ordered repeated values. Median rejects header/footer outliers.
    count = min(len(left), len(right), 18)
    slopes = [(right[i].cy-left[i].cy)/(right[i].cx-left[i].cx) for i in range(count) if abs(right[i].cx-left[i].cx) > 150]
    slopes.sort()
    return slopes[len(slopes)//2] if slopes and abs(slopes[len(slopes)//2]) < .12 else 0.0

def rows_from_tokens(tokens: List[Token], slope: float = 0.0) -> List[List[Token]]:
    rows: List[List[Token]] = []
    aligned_y = lambda x: x.cy - slope * x.cx
    for t in sorted(tokens, key=lambda x: (x.page, aligned_y(x), x.cx)):
        # Median-like local height adaptive tolerance, robust to photographed skew.
        # OCR boxes commonly overlap vertically even when they are adjacent
        # printed lines.  Half-height keeps a row's slightly tilted cells
        # together without merging the next invoice line.
        tolerance = max(10, t.box[3] * .45)
        if not rows or t.page != rows[-1][0].page or abs(aligned_y(t) - sum(aligned_y(x) for x in rows[-1]) / len(rows[-1])) > tolerance:
            rows.append([t])
        else: rows[-1].append(t)
    for row in rows: row.sort(key=lambda x: x.cx)
    return rows

def headers_in_row(row: List[Token]) -> Dict[str, Token]:
    # Header phrases may be multiple tokens; use their span's center token.
    text = " ".join(t.text.lower() for t in row)
    found = {}
    for field, aliases in HEADER_WORDS.items():
        match = next((a for a in sorted(aliases, key=len, reverse=True) if re.search(r"\b" + re.escape(a) + r"\b", text)), None)
        if match:
            words = match.split()
            candidates = [t for t in row if any(w in t.text.lower() for w in words)]
            if candidates: found[field] = candidates[len(candidates)//2]
    # Wrapped heading words are not adjacent in OCR reading order. Join them by
    # spatial proximity instead (e.g. Extended above Price).
    extended = [t for t in row if "extended" in t.text.lower()]
    unit = [t for t in row if t.text.lower() == "unit"]
    prices = [t for t in row if "price" in t.text.lower()]
    for base, field in ((extended, "line_total"), (unit, "unit_price")):
        for left in base:
            mate = next((p for p in prices if abs(p.cx-left.cx) < 110 and abs(p.cy-left.cy) < 120), None)
            if mate:
                found[field] = left
                break
    return found

def numeric(text: str) -> Optional[Decimal]:
    # Parsing is intentionally strict: raw text stays unchanged and 25.5O is not a number.
    try: return Decimal(text.replace("$", "").replace(",", "")) if re.fullmatch(r"\$?[0-9,]+(?:\.[0-9]{1,2})?", text.strip()) else None
    except InvalidOperation: return None

class TableReconstructor:
    def reconstruct(self, tokens: List[Token]) -> Dict[str, Any]:
        slope = estimate_row_slope(tokens)
        rows = rows_from_tokens(tokens, slope)
        aligned_y = lambda t: t.cy - slope * t.cx
        # Table headings often wrap across 2–3 physical OCR rows (e.g. "Unit"
        # then "Price"). Combine a short vertical header band before scoring.
        header_candidates = []
        for i in range(len(rows)):
            band = list(rows[max(0, i-1)])
            for extra in rows[i:i+7]:
                if extra[0].page == band[0].page and extra[0].cy - band[0].cy < 210:
                    band = band + extra
            header_candidates.append((i, headers_in_row(band)))
        header_candidates = [(i, h) for i, h in header_candidates if len(h) >= 2]
        debug: Dict[str, Any] = {"candidate_table_regions": [], "failure_reason": None, "row_alignment_slope": slope}
        if not header_candidates:
            # Header-free fallback: select the densest consecutive mixed
            # text/numeric rows above an explicitly labelled totals section.
            total_row = next((i for i, row in enumerate(rows) if any(re.search(r"\b(subtotal|invoice total|grand total|balance due)\b", t.text, re.I) for t in row)), len(rows))
            candidates = [(i, row) for i, row in enumerate(rows[:total_row]) if len(row) >= 2 and any(numeric(t.text) is not None for t in row) and any(re.search(r"[A-Za-z]", t.text) for t in row)]
            if len(candidates) < 2:
                debug["failure_reason"] = "no header row found; fallback found insufficient repeated mixed rows"
                return {"rows": rows, "table_rows": [], "columns": {}, "bounds": None, "debug": debug}
            chosen = candidates[-min(len(candidates), 15):]
            centers = sorted(t.cx for _, row in chosen for t in row)
            clusters = []
            for center in centers:
                if not clusters or center-clusters[-1] > 95: clusters.append(center)
            columns = {f"inferred_column_{i+1}": {"center": center, "left": center-47.5, "right": center+47.5, "inferred": True} for i, center in enumerate(clusters)}
            table_rows = [{"row_index": i, "top": min(t.box[1] for t in row), "bottom": max(t.box[1]+t.box[3] for t in row), "cells": {"unlabelled": [asdict(t) for t in row]}} for i, row in chosen]
            table_tokens = [t for _, row in chosen for t in row]
            bounds = [min(t.box[0] for t in table_tokens), min(t.box[1] for t in table_tokens), max(t.box[0]+t.box[2] for t in table_tokens), max(t.box[1]+t.box[3] for t in table_tokens)]
            debug["failure_reason"] = "no header row found; generic repeated-row fallback used"
            debug["candidate_table_regions"].append({"fallback": True, "rows": len(chosen)})
            return {"rows": rows, "table_rows": table_rows, "columns": columns, "bounds": bounds, "assigned_ids": {id(t) for t in table_tokens}, "debug": debug, "header_index": chosen[0][0], "header_tokens": {}}
        # Score headers by repeated body-like rows immediately below, not vendor terms.
        scored = []
        for index, headers in header_candidates:
            body = rows[index+3:index+20]
            repeated = sum(1 for r in body if len(r) >= 2 and any(numeric(t.text) is not None for t in r))
            scored.append((repeated, index, headers))
            debug["candidate_table_regions"].append({"header_row": index, "headers": list(headers), "repeated_body_rows": repeated})
        # A genuine header with more distinct labels outranks an incidental
        # two-word label near the page footer, even if the latter is above many
        # numeric rows.
        repeated, header_index, header_tokens = max(scored, key=lambda x: (len(x[2]), x[0]))
        if repeated < 2:
            debug["failure_reason"] = "insufficient repeated row structure beneath header"
            return {"rows": rows, "table_rows": [], "columns": {}, "bounds": None, "debug": debug}
        ordered = sorted(((name, token.cx) for name, token in header_tokens.items()), key=lambda x: x[1])
        columns = {}
        for i, (name, center) in enumerate(ordered):
            columns[name] = {"center": center, "left": -float("inf") if i == 0 else (ordered[i-1][1]+center)/2, "right": float("inf") if i == len(ordered)-1 else (center+ordered[i+1][1])/2}
        # Header band ends at the lowest header token, not merely its first row.
        header_bottom = max(aligned_y(t) for t in header_tokens.values())
        start_index = next((i for i, row in enumerate(rows) if sum(aligned_y(t) for t in row)/len(row) > header_bottom + 8), header_index + 1)
        # If OCR missed the description heading, infer a description region from
        # repeated alphabetic body tokens. This is geometry/content-type based,
        # never a vendor layout coordinate.
        if "description" not in columns:
            word_centers = [t.cx for row in rows[start_index:start_index+14] for t in row if re.search(r"[A-Za-z]", t.text) and numeric(t.text) is None]
            if word_centers:
                center = sorted(word_centers)[len(word_centers)//2]
                nearest = min(columns, key=lambda name: abs(columns[name]["center"] - center)) if columns else None
                if not nearest or abs(columns[nearest]["center"] - center) > 120:
                    columns["description"] = {"center": center, "left": center-180, "right": center+180, "inferred": True}
        # The inferred column changes neighbour relationships. Rebuild every
        # boundary before assigning tokens; leaving the old quantity boundary
        # was the precise source of description→quantity corruption.
        ordered_columns = sorted(columns.items(), key=lambda item: item[1]["center"])
        for index, (name, column) in enumerate(ordered_columns):
            column["left"] = -float("inf") if index == 0 else (ordered_columns[index-1][1]["center"] + column["center"]) / 2
            column["right"] = float("inf") if index == len(ordered_columns)-1 else (column["center"] + ordered_columns[index+1][1]["center"]) / 2
        table_rows, assigned_ids = [], set()
        # Consecutive body rows; stop after two clearly non-tabular rows.
        misses = 0
        previous_y = None
        for i, row in enumerate(rows[start_index:], start_index):
            row_y = sum(aligned_y(t) for t in row) / len(row)
            if previous_y is not None and row_y - previous_y > 105 and table_rows:
                break  # totals/footer separated from the dense table body
            work_row = row
            cells = {name: [] for name in columns}
            assignments = {}
            for token in work_row:
                # Prefer physical interval overlap over a misleading center-only
                # nearest-column decision at a boundary.
                left, right = token.box[0], token.box[0] + token.box[2]
                overlaps = {name: max(0, min(right, col["right"]) - max(left, col["left"])) for name, col in columns.items()}
                assigned = max(overlaps, key=overlaps.get)
                if overlaps[assigned] <= 0:
                    assigned = min(columns, key=lambda name: abs(token.cx-columns[name]["center"]))
                cells[assigned].append(token)
                assignments[id(token)] = assigned
            # A description header is frequently missed; treat text-heavy cells
            # between numeric columns as a candidate description rather than
            # dropping the visual row.
            numeric_cells = sum(bool([t for t in cell if numeric(t.text) is not None]) for cell in cells.values())
            # Missing OCR text must not discard an otherwise well-positioned
            # invoice row. Table bounds/header context protect this from page
            # metadata; the row is returned with an empty description instead.
            is_body = numeric_cells >= 1 and len(row) >= 1
            if not is_body:
                misses += 1
                if misses >= 2: break
                continue
            misses = 0
            previous_y = row_y
            for cell in cells.values(): assigned_ids.update(id(t) for t in cell)
            table_rows.append({"debug_id": f"row_{len(table_rows)+1:03d}", "row_index": i, "top": min(t.box[1] for t in work_row), "bottom": max(t.box[1]+t.box[3] for t in work_row), "cells": {name: [asdict(t) for t in cell] for name, cell in cells.items()}, "column_assignments": {str(id(t)): assignments[id(t)] for t in work_row}})
        if not table_rows:
            debug["failure_reason"] = "column clustering found headers but no rows matched repeated structure"
        all_ids = {id(t) for t in tokens}
        table_tokens = [t for r in rows[header_index:start_index+len(table_rows)] for t in r]
        bounds = [min(t.box[0] for t in table_tokens), min(t.box[1] for t in table_tokens), max(t.box[0]+t.box[2] for t in table_tokens), max(t.box[1]+t.box[3] for t in table_tokens)] if table_tokens else None
        return {"rows": rows, "table_rows": table_rows, "columns": columns, "bounds": bounds, "assigned_ids": assigned_ids, "debug": debug, "header_index": header_index, "header_tokens": header_tokens}

class InvoiceImportPipeline:
    def __init__(self, template_id: str = "auto"):
        self.template_id = template_id
    def _labelled_fields(self, tokens: List[Token], slope: float) -> Dict[str, Any]:
        """Extract only label-adjacent values; never scan arbitrary page numbers."""
        aligned = lambda t: t.cy - slope * t.cx
        specs = {
            "invoice_number": ("invoice no", "invoice number", "invoice #"),
            "subtotal": ("subtotal",), "freight": ("freight", "delivery"),
            "tax": ("tax",), "grand_total": ("invoice total", "grand total", "total due", "balance due"),
        }
        fields: Dict[str, Any] = {name: None for name in specs}
        evidence = {}
        # Combine token text in nearby same-row bands so Invoice + No. works.
        for name, aliases in specs.items():
            best = None
            for label in tokens:
                label_text = label.text.lower()
                if numeric(label.text) is not None: continue
                nearby_labels = [t for t in tokens if t.page == label.page and abs(aligned(t)-aligned(label)) < 32 and t.cx >= label.cx-15 and t.cx < label.cx+260]
                phrase = " ".join(t.text.lower() for t in sorted(nearby_labels, key=lambda t: t.cx))
                # The anchor itself must identify the label. A nearby number is
                # never allowed to borrow a label from the same row.
                if not any(alias in label_text for alias in aliases): continue
                for value in tokens:
                    parsed = numeric(value.text)
                    if parsed is None or value.page != label.page: continue
                    dx, dy = value.cx - label.cx, abs(aligned(value)-aligned(label))
                    if dx < -20 or dx > 560 or dy > 72: continue
                    # Totals grids often stack labels vertically. Do not let a
                    # value from the preceding labelled row be reused below it.
                    if name != "invoice_number" and value.cy < label.cy - 3: continue
                    score = dx + dy * 4
                    if best is None or score < best[0]: best = (score, parsed, label, value)
            if best:
                _, value, label, token = best
                # Invoice identifiers must remain text, preserving leading zeroes.
                fields[name] = token.text.strip() if name == "invoice_number" else value
                evidence[name] = {"label": asdict(label), "value": asdict(token)}
        return {"fields": fields, "evidence": evidence}

    def run(self, document: OCRDocument) -> Dict[str, Any]:
        # Import lazily to avoid a circular dependency: templates reuse the
        # generic token/row primitives defined in this module.
        from backend.app.services.vendor_templates import apply_vendor_template
        template_result = apply_vendor_template(document, self.template_id)
        layout = TableReconstructor().reconstruct(document.tokens)
        labelled = self._labelled_fields(document.tokens, layout["debug"]["row_alignment_slope"])
        lines = []
        for row in layout["table_rows"]:
            cells = row["cells"]
            def joined(name): return " ".join(t["text"] for t in cells.get(name, []))
            def first_number(name):
                values = [numeric(t["text"]) for t in cells.get(name, [])]
                return next((v for v in reversed(values) if v is not None), None)
            qty, price, total = first_number("quantity"), first_number("unit_price"), first_number("line_total")
            description = joined("description") or None
            sources = {name: [{"text": t["text"], "confidence": t["confidence"], "box": t["box"], "assigned_column": name} for t in cell] for name, cell in cells.items()}
            structurally_valid = bool(description) and all(value is not None for value in (qty, price, total))
            math_ok = None if not structurally_valid else abs(qty * price - total) <= Decimal("0.01")
            status = "grouped_valid" if structurally_valid and math_ok else ("alignment_suspect" if structurally_valid else "grouped_incomplete")
            lines.append({"debug_id": row["debug_id"], "line_number": len(lines)+1, "vendor_sku": None, "description": description, "quantity": qty, "unit_of_measure": joined("uom") or None, "pack_size": None, "unit_cost": price, "extended_cost": total, "field_confidence": {name: min((t["confidence"] for t in cell), default=None) for name, cell in cells.items()}, "validation_status": status, "source_boxes": sources, "math_validation": math_ok})
        token_data = [asdict(t) for t in document.tokens]
        assigned = layout.get("assigned_ids", set())
        unassigned = [asdict(t) for t in document.tokens if id(t) not in assigned]
        diagnostics = {"ocr_token_count": len(document.tokens), "average_ocr_confidence": round(sum(t.confidence for t in document.tokens)/len(document.tokens),2) if document.tokens else 0, "candidate_table_regions_found": len(layout["debug"]["candidate_table_regions"]), "selected_table_region": layout.get("bounds"), "detected_headers": list(layout.get("columns", {})), "detected_columns": len(layout.get("columns", {})), "rows_detected": len(layout["table_rows"]), "tokens_assigned_to_invoice_fields": len(assigned), "unassigned_tokens": len(unassigned), "row_alignment_slope": layout["debug"]["row_alignment_slope"], "failure_reason": layout["debug"]["failure_reason"]}
        debug = {"raw_ocr_tokens": token_data, "raw_ocr": document.raw_text, "tokens": token_data, "rows": [[asdict(t) for t in row] for row in layout["rows"]], "grouped_line_item_rows": lines, "table_rows": layout["table_rows"], "table_bounds": layout.get("bounds"), "columns": layout.get("columns", {}), "unassigned_tokens": unassigned, "diagnostics": diagnostics, "candidate_table_regions": layout["debug"]["candidate_table_regions"], "labelled_field_evidence": labelled["evidence"], "mode": "generic-spatial-table-reconstruction", "requested_template": self.template_id}
        if template_result:
            # Template values win only when validated through its text anchors
            # and row math. Generic output remains in debug for audit/review.
            template_lines = []
            for index, line in enumerate(template_result["lines"], 1):
                template_lines.append({"debug_id": f"{template_result['template_id']}_row_{index:03d}", "line_number": index, "vendor_sku": None, "description": line["description"], "quantity": line["quantity"], "unit_of_measure": None, "pack_size": line["pack_size"], "unit_cost": line["unit_cost"], "extended_cost": line["extended_cost"], "field_confidence": {}, "validation_status": line["validation_status"], "source_boxes": {"template_row": line["source_boxes"]}, "math_validation": line["math_validation"]})
            header = {**labelled["fields"], **{key: value for key, value in template_result["header"].items() if value is not None}}
            debug["vendor_template"] = {"id": template_result["template_id"], "validation": template_result["validation"], "line_sum": str(template_result["line_sum"])}
            debug["mode"] = "marvel_produce_v1"
            return {"header": header, "lines": template_lines or lines, "debug": debug}
        return {"header": labelled["fields"], "lines": lines, "debug": debug}
