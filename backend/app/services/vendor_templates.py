"""Reusable, evidence-preserving vendor invoice templates.

Templates are deliberately anchored on text and relative OCR geometry rather
than page pixels: phone photos can be skewed, cropped, or perspective-warped.
"""
from __future__ import annotations

import datetime as dt
import re
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

from backend.app.services.invoice_pipeline import OCRDocument, Token, numeric, rows_from_tokens, estimate_row_slope


MARVEL_PRODUCE_V1 = {
    "template_id": "marvel_produce_v1",
    "vendor": "MARVEL PRODUCE",
    "required_any": ("marvel produce", "707 executive blvd", "marvelproduce.com", "primusgfs"),
    "minimum_matches": 2,
    "line_start": ("order quantity", "ship quantity", "item number", "unit price", "extended price"),
    "line_end": ("print date", "total paid", "balance due", "subtotal", "invoice total"),
    "money_tolerance": Decimal("0.05"),
}


def _row_text(row: Iterable[Token]) -> str:
    return " ".join(token.text for token in row)


def _money_from(text: str) -> Optional[Decimal]:
    values = re.findall(r"(?<![\w.])\$?([0-9][0-9,]*\.\d{2})(?![\w.])", text)
    return Decimal(values[-1].replace(",", "")) if values else None


def _date_from(text: str) -> Optional[str]:
    match = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text)
    if not match:
        return None
    value = match.group(1).replace("-", "/")
    for fmt in ("%m/%d/%y", "%m/%d/%Y"):
        try:
            return dt.datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return None


class MarvelProduceTemplate:
    id = MARVEL_PRODUCE_V1["template_id"]

    def matches(self, document: OCRDocument) -> bool:
        text = document.raw_text.lower().replace(" ", "")
        return sum(anchor.replace(" ", "") in text for anchor in MARVEL_PRODUCE_V1["required_any"]) >= MARVEL_PRODUCE_V1["minimum_matches"]

    def _label_value(self, rows: List[List[Token]], label: str, parser) -> Optional[Any]:
        """Find a value on the label row or immediately below it, by proximity."""
        label_words = label.lower().replace(".", "").split()
        for index, row in enumerate(rows):
            phrase = _row_text(row).lower().replace(".", "")
            if not all(word in phrase for word in label_words):
                continue
            label_tokens = [t for t in row if any(word in t.text.lower().replace(".", "") for word in label_words)]
            if not label_tokens:
                continue
            right_edge = max(t.cx for t in label_tokens)
            candidates = [t for t in row if t.cx > right_edge - 4]
            # Some Marvel fields print their value directly below the label.
            if index + 1 < len(rows):
                candidates += [t for t in rows[index + 1] if abs(t.cx - right_edge) < 520]
            candidates.sort(key=lambda t: (0 if t in row else 1, abs(t.cx - right_edge)))
            value = parser(" ".join(t.text for t in candidates))
            if value is not None:
                return value
        return None

    def apply(self, document: OCRDocument) -> Dict[str, Any]:
        slope = estimate_row_slope(document.tokens)
        rows = rows_from_tokens(document.tokens, slope)
        string_number = lambda text: (re.search(r"\b\d{5,8}\b", text).group(0) if re.search(r"\b\d{5,8}\b", text) else None)
        text_value = lambda text: text.strip() or None
        header = {
            "vendor_name": MARVEL_PRODUCE_V1["vendor"],
            "invoice_number": self._label_value(rows, "Invoice No", string_number),
            "invoice_date": self._label_value(rows, "Invoice Date", _date_from),
            "po_number": self._label_value(rows, "Customer PO Number", text_value),
            "subtotal": self._label_value(rows, "Subtotal", _money_from),
            "freight": self._label_value(rows, "Freight", _money_from) or Decimal("0"),
            "grand_total": self._label_value(rows, "Invoice Total", _money_from),
            "balance_due": self._label_value(rows, "Balance Due", _money_from),
            "due_date": self._label_value(rows, "Due Date", _date_from),
        }

        # Table boundary is content-based: first header cluster through a total
        # anchor. No fixed Y coordinate or page size assumption is used.
        start = next((i for i, r in enumerate(rows) if sum(a in _row_text(r).lower() for a in MARVEL_PRODUCE_V1["line_start"]) >= 2), None)
        end = next((i for i, r in enumerate(rows[(start or 0) + 1:], (start or 0) + 1) if any(a in _row_text(r).lower() for a in MARVEL_PRODUCE_V1["line_end"])), len(rows))
        line_rows = rows[(start + 1 if start is not None else 0):end]
        lines = []
        for row in line_rows:
            text = _row_text(row)
            amounts = [numeric(t.text) for t in row if numeric(t.text) is not None]
            prices = [value for value in amounts if value is not None and value.as_tuple().exponent <= -2]
            if len(prices) < 2:
                continue
            unit_price, extended = prices[-2], prices[-1]
            quantity = next((value for value in amounts if value is not None and value.as_tuple().exponent >= -2 and value >= 0 and value != unit_price), None)
            pack_match = re.search(r"\b(?:CASE(?:-[A-Z0-9]+)?|CS|EA|LB|CT|BOX|BAG|PK)\b", text, re.I)
            description = text
            for token in row:
                if numeric(token.text) is not None:
                    description = description.replace(token.text, " ")
            if pack_match:
                description = description.replace(pack_match.group(0), " ")
            description = re.sub(r"\b[YN]\b|\s+", " ", description).strip(" -")
            if len(description) < 2:
                continue
            math_ok = quantity is not None and abs(quantity * unit_price - extended) <= Decimal("0.02")
            lines.append({"description": description, "quantity": quantity, "pack_size": pack_match.group(0).upper() if pack_match else None, "unit_cost": unit_price, "extended_cost": extended, "math_validation": math_ok, "validation_status": "template_valid" if math_ok else "template_math_review", "source_boxes": [token.box for token in row]})

        line_sum = sum((line["extended_cost"] for line in lines), Decimal("0"))
        checks = {
            "line_sum_matches_subtotal": header["subtotal"] is not None and abs(line_sum - header["subtotal"]) <= MARVEL_PRODUCE_V1["money_tolerance"],
            "subtotal_plus_freight_matches_total": header["subtotal"] is not None and header["grand_total"] is not None and abs(header["subtotal"] + header["freight"] - header["grand_total"]) <= MARVEL_PRODUCE_V1["money_tolerance"],
            "total_paid_matches_balance": None,  # retained for template compatibility when Total Paid is available
        }
        return {"header": header, "lines": lines, "validation": checks, "line_sum": line_sum}


def apply_vendor_template(document: OCRDocument, requested_template: str = "auto") -> Optional[Dict[str, Any]]:
    if requested_template not in ("auto", MARVEL_PRODUCE_V1["template_id"]):
        return None
    template = MarvelProduceTemplate()
    # Auto mode needs strong multi-anchor detection. A user explicitly choosing
    # Marvel intentionally overrides that gate, which is useful for a cropped
    # photo where the vendor masthead is outside the frame.
    if requested_template == "auto" and not template.matches(document):
        return None
    result = template.apply(document)
    result["template_id"] = template.id
    return result
