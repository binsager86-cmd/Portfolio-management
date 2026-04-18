# Refactoring Baseline — Phase 1C

> Snapshot taken at the start of `refactor/app-stability-uiux` branch.

---

## 1. Test Status

| Suite | Passed | Failed | Warnings |
|-------|--------|--------|----------|
| Backend (pytest) | 298 | 0 | 20 |
| Frontend (jest) | 24 test files | TBD | — |

## 2. Runtime Warnings

| # | Type | Location | Message |
|---|------|----------|---------|
| 1 | FutureWarning (pandas) | `analytics.py:313` | `.fillna` downcasting deprecated |
| 2 | FutureWarning (pandas) | `portfolio_service.py:87` | `.fillna` downcasting deprecated |
| 3 | RuntimeWarning (numpy) | `nanops.py:1016` | Invalid value in subtract |

## 3. Backend Hotspot Files (LOC)

| File | Lines | Target |
|------|------:|--------|
| fundamental.py | 6,122 | Split → 8 modules |
| extraction_service.py | 3,553 | Split → 7 modules |
| portfolio_service.py | 1,610 | Split → 6 modules |
| schema.py | 708 | Keep (infra) |
| auth.py | 622 | Keep |
| market_service.py | 402 | Keep |
| admin.py | 330 | Keep |
| price_service.py | 238 | Keep |
| main.py | 196 | Keep |

**Total hotspot LOC:** 13,781

## 4. Frontend Hotspot Files (LOC)

| File | Lines |
|------|------:|
| AdminDashboardScreen.tsx | 1,216 |
| trading.tsx | 1,070 |
| dividends.tsx | 980 |
| index.tsx (dashboard) | 964 |
| market.tsx | 938 |
| SettingsScreen.tsx | 904 |
| deposits.tsx | 779 |
| alerts.tsx | 752 |
| HoldingsTable.tsx | 743 |
| TradeSimulatorModal.tsx | 729 |
| transactions.tsx | 724 |
| PlannerScreen.tsx | 713 |
| add-stock.tsx | 664 |
| ReconciliationModal.tsx | 660 |
| forgot-password.tsx | 635 |
| IntegrityScreen.tsx | 583 |
| SnapshotLineChart.tsx | 578 |
| PortfolioChart.tsx | 574 |
| register.tsx | 563 |
| portfolio-tracker.tsx | 555 |

**55 files ≥ 200 lines** in the frontend.

## 5. Architecture Stats

- **20 route modules** in backend
- **15 service modules** in backend
- **3 middleware** (SecurityHeaders, PrivateNetworkAccess, RequestSizeLimit) + CORS
- Rate limiter: slowapi with per-endpoint limits (5-10/min auth, 120/min global)

## 6. Key Technical Debt

- Manual schema in schema.py + `add_column_if_missing` migrations (no Alembic in prod)
- SQLAlchemy models drift from raw SQL schema
- No structured logging (plain `logger.info/warning`)
- No correlation ID / request tracing
- No error envelope standardization across all endpoints
- Frontend: no analytics abstraction, no error boundary surfaces
- ESLint `max-lines: 350` rule — 55 files exceed it
