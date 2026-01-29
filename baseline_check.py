import sqlite3
import sys
import os
from math import isclose

# Use environment variable if set, otherwise default to portfolio.db
DB_PATH = os.environ.get("PORTFOLIO_DB_PATH", "portfolio.db")

# ==========
# BASELINE VALUES
# ==========
# These values match the seed_test_data.sql file for CI testing.
# For production DB checks, set PORTFOLIO_DB_PATH=portfolio.db and update values accordingly.
#
# PRODUCTION VALUES (January 29, 2026 - portfolio.db):
#   transactions: count=39, sum_shares=409242.67, sum_purchase_cost=140358.84, sum_sell_value=0.0
#   cash_deposits: count=51, sum_amount=114232.17
#   trading_history: count=66, sum_purchase_cost=349392.55, sum_sell_value=227706.18
#   portfolio_cash: count=3, sum_balance=405.0
#   pfm_income_expense_items: count=10, sum_monthly_amount=4487.0
#   pfm_asset_items: count=1, sum_value_kwd=10000.0
#
BASELINE = {
    "transactions": {
        "count": 39,
        "sum_shares": 409_242.67,
        "sum_purchase_cost": 140_358.84,
        "sum_sell_value": 0.0,
    },
    "cash_deposits": {
        "count": 51,
        "sum_amount": 114_232.17,
    },
    "trading_history": {
        "count": 66,
        "sum_purchase_cost": 349_392.55,
        "sum_sell_value": 227_706.18,
    },
    "portfolio_cash": {
        "count": 3,
        "sum_balance": 405.0,
    },
    "bank_cashflows": {
        "count": 0,
    },
    "pfm_income_expense_items": {
        "count": 10,
        "sum_monthly_amount": 4_487.0,
    },
    "pfm_asset_items": {
        "count": 1,
        "sum_value_kwd": 10_000.0,
    },
    "pfm_liability_items": {
        "count": 0,
    },
}

# Float comparison tolerance
ABS_TOL = 1e-2  # 0.01 KD tolerance


def fetch_one(conn, query):
    cur = conn.cursor()
    cur.execute(query)
    row = cur.fetchone()
    return row[0] if row is not None else None


def check_equal_int(label, actual, expected, errors):
    if actual != expected:
        errors.append(
            f"[FAIL] {label}: expected {expected}, got {actual}"
        )
    else:
        print(f"[OK]   {label}: {actual}")


def check_equal_float(label, actual, expected, errors):
    # Treat None as 0.0 here (for empty tables)
    if actual is None:
        actual = 0.0
    if not isclose(float(actual), float(expected), abs_tol=ABS_TOL):
        errors.append(
            f"[FAIL] {label}: expected {expected}, got {actual}"
        )
    else:
        print(f"[OK]   {label}: {actual}")


def main():
    print("=" * 70)
    print("BASELINE CALCULATION CHECK  —  portfolio.db")
    print("Baseline date: 2026-01-29")
    print("=" * 70)

    conn = sqlite3.connect(DB_PATH)
    errors = []

    # 1) transactions
    print("\n[transactions]")
    q_count = "SELECT COUNT(*) FROM transactions"
    q_sum_shares = "SELECT SUM(shares) FROM transactions"
    q_sum_pc = "SELECT SUM(purchase_cost) FROM transactions"
    q_sum_sv = "SELECT SUM(sell_value) FROM transactions"

    count_tx = fetch_one(conn, q_count)
    sum_shares = fetch_one(conn, q_sum_shares)
    sum_pc = fetch_one(conn, q_sum_pc)
    sum_sv = fetch_one(conn, q_sum_sv)

    bl = BASELINE["transactions"]
    check_equal_int("transactions.count", count_tx, bl["count"], errors)
    check_equal_float("transactions.sum_shares", sum_shares, bl["sum_shares"], errors)
    check_equal_float(
        "transactions.sum_purchase_cost", sum_pc, bl["sum_purchase_cost"], errors
    )
    check_equal_float(
        "transactions.sum_sell_value", sum_sv, bl["sum_sell_value"], errors
    )

    # 2) cash_deposits
    print("\n[cash_deposits]")
    q_count = "SELECT COUNT(*) FROM cash_deposits"
    q_sum_amt = "SELECT SUM(amount) FROM cash_deposits"

    count_cd = fetch_one(conn, q_count)
    sum_amt = fetch_one(conn, q_sum_amt)

    bl = BASELINE["cash_deposits"]
    check_equal_int("cash_deposits.count", count_cd, bl["count"], errors)
    check_equal_float("cash_deposits.sum_amount", sum_amt, bl["sum_amount"], errors)

    # 3) trading_history
    print("\n[trading_history]")
    q_count = "SELECT COUNT(*) FROM trading_history"
    q_sum_pc = "SELECT SUM(purchase_cost) FROM trading_history"
    q_sum_sv = "SELECT SUM(sell_value) FROM trading_history"

    count_th = fetch_one(conn, q_count)
    sum_pc_th = fetch_one(conn, q_sum_pc)
    sum_sv_th = fetch_one(conn, q_sum_sv)

    bl = BASELINE["trading_history"]
    check_equal_int("trading_history.count", count_th, bl["count"], errors)
    check_equal_float(
        "trading_history.sum_purchase_cost", sum_pc_th, bl["sum_purchase_cost"], errors
    )
    check_equal_float(
        "trading_history.sum_sell_value", sum_sv_th, bl["sum_sell_value"], errors
    )

    # 4) portfolio_cash
    print("\n[portfolio_cash]")
    q_count = "SELECT COUNT(*) FROM portfolio_cash"
    q_sum_bal = "SELECT SUM(balance) FROM portfolio_cash"

    count_pc = fetch_one(conn, q_count)
    sum_bal = fetch_one(conn, q_sum_bal)

    bl = BASELINE["portfolio_cash"]
    check_equal_int("portfolio_cash.count", count_pc, bl["count"], errors)
    check_equal_float("portfolio_cash.sum_balance", sum_bal, bl["sum_balance"], errors)

    # 5) bank_cashflows
    print("\n[bank_cashflows]")
    q_count = "SELECT COUNT(*) FROM bank_cashflows"
    count_bc = fetch_one(conn, q_count)

    bl = BASELINE["bank_cashflows"]
    check_equal_int("bank_cashflows.count", count_bc, bl["count"], errors)

    # 6) pfm_income_expense_items
    print("\n[pfm_income_expense_items]")
    q_count = "SELECT COUNT(*) FROM pfm_income_expense_items"
    # NOTE: If your logic is different (e.g. income - expense), adjust the query OR the baseline.
    q_sum_m = "SELECT SUM(monthly_amount) FROM pfm_income_expense_items"

    count_pfm_ie = fetch_one(conn, q_count)
    sum_monthly = fetch_one(conn, q_sum_m)

    bl = BASELINE["pfm_income_expense_items"]
    check_equal_int(
        "pfm_income_expense_items.count", count_pfm_ie, bl["count"], errors
    )
    check_equal_float(
        "pfm_income_expense_items.sum_monthly_amount",
        sum_monthly,
        bl["sum_monthly_amount"],
        errors,
    )

    # 7) pfm_asset_items
    print("\n[pfm_asset_items]")
    q_count = "SELECT COUNT(*) FROM pfm_asset_items"
    q_sum_val = "SELECT SUM(value_kwd) FROM pfm_asset_items"

    count_pfm_a = fetch_one(conn, q_count)
    sum_val_kwd = fetch_one(conn, q_sum_val)

    bl = BASELINE["pfm_asset_items"]
    check_equal_int("pfm_asset_items.count", count_pfm_a, bl["count"], errors)
    check_equal_float(
        "pfm_asset_items.sum_value_kwd", sum_val_kwd, bl["sum_value_kwd"], errors
    )

    # 8) pfm_liability_items
    print("\n[pfm_liability_items]")
    q_count = "SELECT COUNT(*) FROM pfm_liability_items"
    count_pfm_l = fetch_one(conn, q_count)

    bl = BASELINE["pfm_liability_items"]
    check_equal_int("pfm_liability_items.count", count_pfm_l, bl["count"], errors)

    conn.close()

    print("\n" + "=" * 70)
    if errors:
        print("BASELINE CHECK: ❌ FAILED")
        for e in errors:
            print(e)
        print("=" * 70)
        sys.exit(1)
    else:
        print("BASELINE CHECK: ✅ PASSED — All key totals match baseline.")
        print("=" * 70)
        sys.exit(0)


if __name__ == "__main__":
    main()
