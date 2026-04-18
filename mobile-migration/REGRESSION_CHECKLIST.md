# Regression Checklist

> Test these critical flows after each major refactoring phase.

## Auth Flows
- [ ] Login with username/password
- [ ] Login with Google OAuth
- [ ] Register new account (password strength validation)
- [ ] Forgot password flow
- [ ] Token refresh (access token renewal)
- [ ] Logout (token blacklisting)
- [ ] Session persistence across app restart

## Dashboard / Overview
- [ ] Portfolio overview loads (total value, gain/loss, ROI)
- [ ] Holdings summary with correct share counts
- [ ] Performance chart renders
- [ ] Cash balances display
- [ ] AI Financial Intelligence panel (if Gemini key set)

## Holdings
- [ ] Holdings table shows all stocks per portfolio
- [ ] Current prices update
- [ ] Unrealized P&L calculation correct
- [ ] Portfolio filter works (KFH/BBYN/USA)

## Transactions
- [ ] Add Buy transaction
- [ ] Add Sell transaction
- [ ] Add Dividend transaction
- [ ] Add Bonus shares
- [ ] Edit existing transaction
- [ ] Delete transaction (soft delete)
- [ ] Transaction list with filters

## Cash Deposits
- [ ] Add deposit
- [ ] Add withdrawal
- [ ] Deposit list displays
- [ ] Include/exclude in analysis toggle

## Trading
- [ ] Trading overview table loads
- [ ] KFH trade import (PDF/manual)
- [ ] Trade simulator modal
- [ ] Realized trades section

## Fundamental Analysis
- [ ] Upload financial statement PDF
- [ ] Extraction job runs
- [ ] View extracted data (EPS, cashflow, debt)
- [ ] Buffett checklist / scores
- [ ] Valuation metrics

## Integrity / Reconciliation
- [ ] Cash balance check per portfolio
- [ ] Position cross-check
- [ ] Snapshot freshness
- [ ] Anomaly detection
- [ ] Completeness check

## Settings
- [ ] Change password
- [ ] Set CBK rate (risk-free rate)
- [ ] Backup & restore
- [ ] Admin dashboard (if admin)

## Market
- [ ] Market overview loads
- [ ] Stock search
- [ ] Stock detail view

## Cross-Cutting
- [ ] Rate limiting works (login: 5/min)
- [ ] Auth headers sent on all protected routes
- [ ] Error responses have consistent envelope
- [ ] App works on mobile (Android APK)
- [ ] App works on web
- [ ] Responsive layout on different screen sizes
