# DEVELOPMENT.md - Reserve Local-First Restaurant Back-Office System

Reserve is a desktop-style local-first restaurant operations software inspired by Restaurant365 functionality, running on the user's local computer with SQLite storage.

---

## 1. System Architecture

```
                       ┌────────────────────────────────────────┐
                       │     React + TypeScript Desktop UI      │
                       │     (Vite on http://localhost:3000)    │
                       └───────────────────┬────────────────────┘
                                           │ API Proxy (/api)
                                           ▼
                       ┌────────────────────────────────────────┐
                       │          Python FastAPI Server         │
                       │        (Uvicorn on port 8000)          │
                       └─────┬────────────────────────────┬─────┘
                             │                            │
                             ▼                            ▼
                 ┌───────────────────────┐    ┌───────────────────────┐
                 │ Local SQLite Database │    │  Local OCR Provider   │
                 │  (WAL Mode Enabled)   │    │(EasyOCR / PyTesseract)│
                 └───────────────────────┘    └───────────────────────┘
```

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide icons.
- **Backend**: Python 3.9+, FastAPI, SQLAlchemy ORM, Alembic migrations.
- **OCR Engine**: Provider/Adapter architecture (`OCRProvider` -> `LocalOCRProvider`) with PyTesseract/EasyOCR fallback, confidence scoring (High/Review/Attention), vendor template rules, and regex field matching.
- **Storage Directory Structure**:
  - `data/database/reserve_app.db` - Primary SQLite Relational Database.
  - `data/invoices/original/` - Preserved uploaded original invoice files (PDF/PNG/JPG).
  - `data/deposits/attachments/` - Bank deposit slips and receipt photos.
  - `data/backups/` - Timestamped ZIP archives.

---

## 2. Database Schema Overview

The SQLite database uses normalized tables with foreign keys and UUID primary keys:
1. `vendors`: Vendor names, account numbers, contacts.
2. `vendor_items`: Vendor SKUs, pack sizes, unit of measures, and internal item mappings.
3. `inventory_items`: Internal item master (name, category, storage location, base UOM, current/previous costs).
4. `unit_conversions`: Unit conversions per item (e.g., 1 Case = 20 LB).
5. `invoices` & `invoice_lines`: Preserved invoice headers, OCR confidence scores, line items, and mapping statuses.
6. `inventory_counts` & `inventory_count_lines`: Periodic stock counts with extended valuation.
7. `inventory_transactions`: Master inventory transaction ledger (Purchases, Counts, Transfers, Waste).
8. `waste_logs`: Ingredient spoilage, expiration, prep waste logs.
9. `recipes` & `recipe_ingredients`: Recipe ingredient matrices, yield, menu price, food cost %, and contribution margins.
10. `sales_imports` & `sales_lines`: Imported POS PMIX sales records with SHA-256 duplicate import detection.
11. `deposits`: Daily cash deposit records, expected vs counted cash, and auto-calculated over/short.
12. `cost_history`: Item price history, 30/90 day cost trends, dollar change, and % change alerts.
13. `audit_logs`: Immutable audit log entries for approvals, overrides, and manual edits.

---

## 3. How OCR Engine Works

1. **Upload & Storage**: The uploaded invoice PDF or image is assigned a unique UUID and saved to `data/invoices/original/`.
2. **Text Extraction**: `LocalOCRProvider` processes PDFs via text streams / EasyOCR or PyTesseract for image scanning.
3. **Field & Pattern Matching**: Pattern heuristics match vendor name (Sysco, US Foods, PFG), invoice number, date, subtotal, tax, and total amount.
4. **Confidence Scoring**: Each field is evaluated:
   - `90 - 100%`: High Confidence (Green)
   - `75 - 89%`: Review Recommended (Yellow)
   - `< 75%`: Attention Required (Red)
5. **Split-Screen Review**: The user reviews extracted line items side-by-side with the original invoice document, maps unknown vendor SKUs, makes manual adjustments, and approves the invoice.
6. **Ledger Posting**: Upon approval, invoice purchases post to `inventory_transactions`, item costs update, and vendor SKU mappings are saved for future suggestions.

---

## 4. How Operational Calculations Work

### Unit Conversion Engine
Converts purchase or recipe UOM into base inventory UOM using configured factors:
$$\text{Base Qty} = \text{Counted Qty} \times \text{Factor}$$

### Actual Usage Formula
$$\text{Actual Usage} = \text{Beginning Inventory} + \text{Purchases} + \text{Transfers In} - \text{Transfers Out} - \text{Ending Inventory}$$

### Theoretical Usage Formula
$$\text{Theoretical Usage} = \sum (\text{Menu Item Quantity Sold} \times \text{Recipe Ingredient Quantity (in Base UOM)})$$

### Variances
- **Quantity Variance**: $\text{Actual Usage} - \text{Theoretical Usage}$
- **Dollar Variance**: $\text{Quantity Variance} \times \text{Current Unit Cost}$
- **Unexplained Variance**: $\text{Quantity Variance} - \text{Logged Waste}$

---

## 5. How to Run the Application

Execute the unified launcher script:
```bash
python launcher.py
```
This automatically starts:
1. Local FastAPI server on `http://localhost:8000`
2. React frontend on `http://localhost:3000`
3. Opens the application in your web browser.

To run tests:
```bash
PYTHONPATH=. ./venv/bin/pytest backend/app/tests/test_calculations.py
```

---

## 6. How Backups Work

- Manual backups or automated daily retention generate timestamped `.zip` archives under `data/backups/`.
- Archives include the SQLite database, uploaded invoice files, deposit slips, and configuration.
- The **Restore Backup** feature extracts the ZIP archive into `data/` and re-initializes database sessions.

---

## 7. Development & Integration Roadmap

- [x] **Phase 1**: Local OCR engine, invoice review split-screen, vendor SKU mapping, price history trends.
- [x] **Phase 2**: Stock count sheets, inventory transaction ledger, waste logging, valuation.
- [x] **Phase 3**: Recipe matrices, food cost % calculation, POS PMIX CSV import with SHA-256 duplicate detection.
- [x] **Phase 4**: Actual vs. Theoretical (AvT) food cost reporting, quantity/dollar variance, category rollups, item drill-down.
- [x] **Phase 5**: Daily cash deposits (expected vs actual cash, over/short tracking), manager dashboard, ZIP backup & restore, audit logs, launcher script.
- [ ] **Phase 6 (Future Expansion)**: Direct local POS hardware integrations, multi-location consolidation, cloud database sync adapter.

