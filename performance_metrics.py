import sqlite3
import argparse
import datetime as dt
from math import isfinite

DB = "portfolio.db"

# Adjust these if your system uses different naming
EXTERNAL_IN_TYPES  = {"CASH_IN", "DEPOSIT", "INJECTION", "TOPUP"}
EXTERNAL_OUT_TYPES = {"CASH_OUT", "WITHDRAWAL", "WITHDRAW", "DRAW"}

def parse_date(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y-%m-%d").date()

def xirr(cashflows, guess=0.10):
    """
    cashflows: list of (date, amount) where amount is +inflow to investor, -outflow from investor
    returns annualized rate
    """
    if len(cashflows) < 2:
        return None

    t0 = cashflows[0][0]
    def yearfrac(d):
        return (d - t0).days / 365.0

    def npv(rate):
        total = 0.0
        for d, amt in cashflows:
            total += amt / ((1.0 + rate) ** yearfrac(d))
        return total

    def d_npv(rate):
        total = 0.0
        for d, amt in cashflows:
            yf = yearfrac(d)
            total += (-yf) * amt / ((1.0 + rate) ** (yf + 1.0))
        return total

    r = guess
    for _ in range(100):
        f = npv(r)
        df = d_npv(r)
        if df == 0:
            break
        nr = r - f / df
        if not isfinite(nr):
            break
        if abs(nr - r) < 1e-10:
            return nr
        r = nr
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True, help="YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD")
    args = ap.parse_args()

    start = parse_date(args.start)
    end = parse_date(args.end)

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # Portfolio value series from snapshots
    vals = cur.execute("""
    SELECT snapshot_date, SUM(mkt_value_base) AS v
    FROM daily_snapshots
    WHERE snapshot_date BETWEEN ? AND ?
    GROUP BY snapshot_date
    ORDER BY snapshot_date;
    """, (args.start, args.end)).fetchall()

    if not vals:
        print("❌ No snapshots in this range. Build snapshots first.")
        return

    # External flows (best effort): uses cash_amount if present and entry_type in external sets.
    # Convention:
    #   CASH_IN = investor adds money => investor outflow (-)
    #   CASH_OUT = investor withdraws => investor inflow (+)
    # For XIRR we use investor perspective.
    has_cash_amount = any(c[1] == "cash_amount" for c in cur.execute("PRAGMA table_info(ledger_entries);").fetchall())
    has_entry_type = any(c[1] == "entry_type" for c in cur.execute("PRAGMA table_info(ledger_entries);").fetchall())
    has_entry_dt = any(c[1] == "entry_datetime" for c in cur.execute("PRAGMA table_info(ledger_entries);").fetchall())

    cashflows = []

    if has_cash_amount and has_entry_type and has_entry_dt:
        rows = cur.execute("""
        SELECT DATE(entry_datetime) AS d, UPPER(TRIM(entry_type)) AS t, cash_amount AS amt
        FROM ledger_entries
        WHERE DATE(entry_datetime) BETWEEN ? AND ?
          AND cash_amount IS NOT NULL
        ORDER BY DATE(entry_datetime);
        """, (args.start, args.end)).fetchall()

        for r in rows:
            d = parse_date(r["d"])
            t = r["t"]
            amt = float(r["amt"])
            if t in EXTERNAL_IN_TYPES:
                cashflows.append((d, -abs(amt)))  # investor pays in
            elif t in EXTERNAL_OUT_TYPES:
                cashflows.append((d, abs(amt)))   # investor receives out
            # else: ignore (trades/dividends/etc.) for external-flow based XIRR

    # Ending value as inflow (investor could liquidate)
    end_val = float(vals[-1]["v"])
    cashflows_sorted = sorted(cashflows, key=lambda x: x[0])
    if cashflows_sorted:
        # anchor at first flow date for XIRR stability
        cashflows_sorted.append((end, end_val))
        rate = xirr(cashflows_sorted, guess=0.10)
    else:
        rate = None

    # TWR approximation (based on portfolio value change; ignores external flows if not detected)
    # daily return: (Vt - Vt-1) / Vt-1
    twr = 1.0
    prev = None
    for r in vals:
        v = float(r["v"])
        if prev is None:
            prev = v
            continue
        if prev != 0:
            twr *= (v / prev)
        prev = v
    twr_total = twr - 1.0

    # Simple summary
    start_val = float(vals[0]["v"])
    print("\n=== Performance Metrics (Base=KWD) ===")
    print(f"Range: {args.start} → {args.end}")
    print(f"Start Value (KWD): {start_val:,.3f}")
    print(f"End Value   (KWD): {end_val:,.3f}")
    print(f"Value Change(KWD): {(end_val - start_val):,.3f}")
    print(f"TWR (approx, total): {twr_total*100:,.2f}%")

    if rate is None:
        print("XIRR (money-weighted): N/A (no external CASH_IN/CASH_OUT detected in ledger_entries)")
        print("Tip: if you record deposits/withdrawals with entry_type = CASH_IN / CASH_OUT and cash_amount, XIRR will work.")
    else:
        print(f"XIRR (money-weighted, annualized): {rate*100:,.2f}%")

    con.close()

if __name__ == "__main__":
    main()
