from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from decimal import Decimal

@dataclass
class OCRFieldResult:
    value: Any
    confidence: float  # 0 to 100
    raw_text: Optional[str] = None
    bounding_box: Optional[List[int]] = None  # [x, y, w, h]

@dataclass
class OCRResultLine:
    line_number: int
    vendor_sku: Optional[str] = None
    description: str = ""
    quantity: Decimal = Decimal("1.0")
    unit_of_measure: Optional[str] = None
    pack_size: Optional[str] = None
    unit_cost: Decimal = Decimal("0.00")
    extended_cost: Decimal = Decimal("0.00")
    confidence: float = 100.0

@dataclass
class OCRResult:
    vendor_name: OCRFieldResult = field(default_factory=lambda: OCRFieldResult("", 0.0))
    vendor_address: OCRFieldResult = field(default_factory=lambda: OCRFieldResult("", 0.0))
    invoice_number: OCRFieldResult = field(default_factory=lambda: OCRFieldResult("", 0.0))
    invoice_date: OCRFieldResult = field(default_factory=lambda: OCRFieldResult("", 0.0))
    due_date: OCRFieldResult = field(default_factory=lambda: OCRFieldResult("", 0.0))
    po_number: OCRFieldResult = field(default_factory=lambda: OCRFieldResult("", 0.0))
    subtotal: OCRFieldResult = field(default_factory=lambda: OCRFieldResult(Decimal("0.00"), 0.0))
    tax: OCRFieldResult = field(default_factory=lambda: OCRFieldResult(Decimal("0.00"), 0.0))
    delivery_fees: OCRFieldResult = field(default_factory=lambda: OCRFieldResult(Decimal("0.00"), 0.0))
    other_fees: OCRFieldResult = field(default_factory=lambda: OCRFieldResult(Decimal("0.00"), 0.0))
    credits: OCRFieldResult = field(default_factory=lambda: OCRFieldResult(Decimal("0.00"), 0.0))
    discounts: OCRFieldResult = field(default_factory=lambda: OCRFieldResult(Decimal("0.00"), 0.0))
    total_amount: OCRFieldResult = field(default_factory=lambda: OCRFieldResult(Decimal("0.00"), 0.0))
    lines: List[OCRResultLine] = field(default_factory=list)
    raw_text: str = ""

class OCRProvider(ABC):
    @abstractmethod
    def process_file(self, file_path: str) -> OCRResult:
        """Process an image or PDF file and return parsed invoice structured data."""
        pass

