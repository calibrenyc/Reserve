# Reserve

<p align="center">
  <img src="frontend/src/assets/reserve-logo.png" alt="Reserve" width="720" />
</p>

Reserve is a local-first restaurant back-office application for purchasing, inventory, recipe costing, sales imports, deposits, and Actual-versus-Theoretical reporting. It keeps operational data on the computer running the application, using SQLite for storage.

## What it does

- Imports and reviews vendor invoices with local OCR and vendor-item matching.
- Maintains inventory items, prices, count sheets, transfers, and waste logs.
- Costs recipes and compares theoretical usage with actual inventory usage.
- Imports POS sales mix (PMIX) data and records daily cash deposits.
- Provides local backups, restore support, and an audit trail.

## Tech stack

- React, TypeScript, Vite, and Tailwind CSS for the interface.
- FastAPI and SQLAlchemy for the local API.
- SQLite for local persistence.
- RapidOCR with PyTesseract fallback for invoice text extraction.

## Quick start

### Prerequisites

- Python 3.9 or newer
- Node.js 18 or newer and npm
- Tesseract (recommended for the OCR fallback)

On macOS, install Tesseract with `brew install tesseract`.

### Install and run

```bash
git clone <your-repository-url>
cd Reserve

python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

cd frontend
npm install
cd ..

python launcher.py
```

The launcher builds the frontend, starts the server, and opens the app at [http://localhost:8000](http://localhost:8000). The API is available under `/api` and interactive API documentation is available at `/docs` while the server is running.

For frontend-only development:

```bash
cd frontend
npm run dev
```

## Testing and verification

Run the backend calculations test suite from the project root:

```bash
PYTHONPATH=. ./venv/bin/pytest backend/app/tests/test_calculations.py
```

Build the frontend production bundle:

```bash
cd frontend
npm run build
```

## Local data and backups

Reserve stores its runtime data outside source control under `data/`:

- `data/database/` — SQLite database
- `data/invoices/original/` — uploaded invoice originals
- `data/deposits/attachments/` — deposit attachments
- `data/backups/` — ZIP backups

Use the in-app **Backups & Recovery** area before moving to a new machine or making a major upgrade. Do not commit invoices, databases, or backups to a shared repository.

## Project layout

```text
backend/app/        FastAPI application, models, routes, and services
frontend/src/       React interface and brand assets
data/               Local runtime data (ignored by Git)
launcher.py         One-command local launcher
DEVELOPMENT.md      Architecture and implementation notes
```

## Development notes

Read [DEVELOPMENT.md](DEVELOPMENT.md) for the data model, OCR pipeline, operating calculations, and roadmap. Keep new customer data and generated artifacts out of version control, and test any inventory or costing changes against the calculation suite before release.
