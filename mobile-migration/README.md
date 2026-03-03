# Portfolio App — Mobile Migration

## Architecture

```
/portfolio_app
  ├── (existing Streamlit app — DO NOT TOUCH)
  │     ├── ui.py
  │     ├── portfolio.db      ← Live Database
  │     └── ...
  │
  └── /mobile-migration       ← NEW (safe sandbox)
        ├── /backend-api      ← FastAPI server
        │     ├── /app
        │     │   ├── main.py          (entry point)
        │     │   ├── /api             (route handlers)
        │     │   │   ├── auth.py
        │     │   │   └── portfolio.py
        │     │   ├── /core            (config, database)
        │     │   │   ├── config.py
        │     │   │   └── database.py
        │     │   └── /services        (business logic)
        │     │       ├── auth_service.py
        │     │       ├── fx_service.py
        │     │       └── portfolio_service.py
        │     ├── .env
        │     └── requirements.txt
        │
        ├── /mobile-app        ← React Native Expo (Phase 2)
        │     ├── /app
        │     ├── /components
        │     └── /services
        │
        └── dev_portfolio.db   ← Development database (COPY of portfolio.db)
```

## Safety Rules

1. **No existing files are modified.** All new code lives under `mobile-migration/`.
2. **Development database:** The backend uses `dev_portfolio.db` (a copy). The live `portfolio.db` is never touched.
3. **WAL mode:** SQLite WAL journal mode is enabled for safe concurrent reads.

---

## Phase 1: Backend API (FastAPI)

### Prerequisites

- Python 3.10+
- A virtual environment (recommended)

### Setup

```bash
# 1. Navigate to backend folder
cd mobile-migration/backend-api

# 2. Create & activate venv
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. IMPORTANT — Copy your live database
copy ..\..\portfolio.db ..\dev_portfolio.db
# cp ../../portfolio.db ../dev_portfolio.db   # macOS/Linux

# 5. Edit .env if needed (SECRET_KEY, CORS_ORIGINS)

# 6. Run the server
uvicorn app.main:app --reload --port 8000
```

### Test Endpoints

Open **http://localhost:8000/docs** (Swagger UI):

1. **Health check:** `GET /health` — no auth needed.
2. **Login:**
   - Click **Authorize** → enter your existing Streamlit username + password.
   - Or POST to `/api/auth/login` with form-encoded `username` + `password`.
   - Or POST JSON to `/api/auth/login/json`.
3. **Portfolio overview:** `GET /api/portfolio/overview` — requires Bearer token.
4. **Holdings:** `GET /api/portfolio/holdings` — includes `market_value_kwd` and `unrealized_pnl_kwd`.
5. **Per-portfolio table:** `GET /api/portfolio/table/KFH` (or BBYN, USA).
6. **FX rate:** `GET /api/portfolio/fx-rate`.

### Verify Data Integrity

Compare the JSON output of `/api/portfolio/overview` and `/api/portfolio/holdings`
with what you see in the legacy Streamlit app. The numbers should match.

---

## Switching to the Live Database (Production)

When you're ready to point the backend at the real database:

1. Edit `mobile-migration/backend-api/.env`:
   ```
   DATABASE_PATH=../../portfolio.db
   ```
2. Restart the server.

> **Warning:** This means both Streamlit and FastAPI share the same DB. WAL mode
> allows concurrent reads safely, but be cautious with concurrent writes.

---

## Phase 2: Mobile App (React Native Expo) — *Not yet implemented*

The `mobile-app/` folder is a placeholder for the Expo + React Native frontend
that will consume the FastAPI backend. This will be built in Phase 2.
