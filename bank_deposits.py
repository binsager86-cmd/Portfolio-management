from typing import Optional
import sqlite3
from datetime import date

DB_NAME = "portfolio.db"


def prompt_non_empty(label: str) -> str:
    while True:
        v = input(f"{label}: ").strip()
        if v:
            return v
        print("  ❌ Required. Please enter a value.")


def prompt_date(label: str, default_today: bool = True) -> str:
    default = date.today().isoformat() if default_today else ""
    while True:
        v = input(f"{label} [{default}]: ").strip()
        if not v and default:
            return default
        # very light validation YYYY-MM-DD
        if len(v) == 10 and v[4] == "-" and v[7] == "-":
            return v
        print("  ❌ Use format YYYY-MM-DD (example: 2025-12-22)")


def prompt_amount(label: str) -> float:
    while True:
        raw = input(f"{label} (use negative for withdrawal): ").strip().replace(",", "")
        try:
            return float(raw)
        except ValueError:
            print("  ❌ Enter a valid number (example: 1500 or -300).")


def table_exists(cur, name: str) -> bool:
    cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return cur.fetchone() is not None


def add_bank_txn(conn, bank_name: str, txn_date: str, amount: float, description: str, comments: str):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO bank_cashflows (bank_name, txn_date, amount, description, comments)
        VALUES (?, ?, ?, ?, ?)
    """, (bank_name, txn_date, amount, description, comments))
    conn.commit()


def show_bank_totals(conn):
    cur = conn.cursor()
    cur.execute("SELECT bank_name, bank_total FROM bank_totals")
    rows = cur.fetchall()

    cur.execute("SELECT ROUND(SUM(amount), 3) FROM bank_cashflows")
    grand = cur.fetchone()[0]
    grand = grand if grand is not None else 0.0

    print("\n📊 Totals by bank")
    print("-" * 45)
    if not rows:
        print("(no bank deposits yet)")
    else:
        for bank_name, total in rows:
            print(f"{bank_name:<25} {total:>15,.3f}")
    print("-" * 45)
    print(f"{'GRAND TOTAL':<25} {grand:>15,.3f}\n")


def list_deposits(conn, bank_filter: Optional[str] = None, limit: int = 30):
    cur = conn.cursor()
    if bank_filter:
        cur.execute("""
            SELECT txn_date, bank_name, amount, COALESCE(description,''), COALESCE(comments,'')
            FROM bank_cashflows
            WHERE bank_name = ?
            ORDER BY txn_date DESC, bank_txn_id DESC
            LIMIT ?
        """, (bank_filter, limit))
    else:
        cur.execute("""
            SELECT txn_date, bank_name, amount, COALESCE(description,''), COALESCE(comments,'')
            FROM bank_cashflows
            ORDER BY txn_date DESC, bank_txn_id DESC
            LIMIT ?
        """, (limit,))
    rows = cur.fetchall()

    print("\n🧾 Latest bank transactions")
    print("-" * 120)
    if not rows:
        print("(no transactions)")
        print("-" * 120)
        return

    print(f"{'Date':<12} {'Bank':<18} {'Amount':>12}  {'Description':<40}  {'Comments'}")
    print("-" * 120)
    for d, b, a, desc, com in rows:
        a_txt = f"{a:,.3f}"
        print(f"{d:<12} {b:<18} {a_txt:>12}  {desc[:40]:<40}  {com}")
    print("-" * 120 + "\n")


def main():
    conn = sqlite3.connect(DB_NAME)

    # Safety: ensure schema exists
    cur = conn.cursor()
    if not table_exists(cur, "bank_cashflows"):
        conn.close()
        raise RuntimeError("bank_cashflows table not found. Run: python upgrade_banks.py")

    while True:
        print("=== BANK DEPOSITS MENU ===")
        print("1) Add deposit/withdrawal")
        print("2) Show totals (per bank + grand total)")
        print("3) List last transactions")
        print("4) List last transactions for a bank")
        print("0) Exit")
        choice = input("Choose: ").strip()

        if choice == "1":
            print("\n➕ Add bank transaction")
            bank = prompt_non_empty("Bank name (example: KFH, NBK, Boubyan)")
            d = prompt_date("Date")
            amt = prompt_amount("Amount")
            desc = input("Description (optional): ").strip()
            com = input("Comments (optional): ").strip()

            add_bank_txn(conn, bank, d, amt, desc, com)
            print("✅ Saved.")
            show_bank_totals(conn)

        elif choice == "2":
            show_bank_totals(conn)

        elif choice == "3":
            list_deposits(conn, bank_filter=None, limit=30)

        elif choice == "4":
            bank = prompt_non_empty("Bank name")
            list_deposits(conn, bank_filter=bank, limit=30)

        elif choice == "0":
            conn.close()
            print("Bye 👋")
            return
        else:
            print("❌ Invalid choice.\n")


if __name__ == "__main__":
    main()
