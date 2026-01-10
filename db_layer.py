"""
Database Abstraction Layer for Portfolio App
Supports both SQLite (local development) and PostgreSQL (Supabase for production)

Usage:
    - Local: Uses SQLite automatically
    - Cloud: Set SUPABASE_URL and SUPABASE_KEY in Streamlit secrets or environment
"""

import os
import sqlite3
from contextlib import contextmanager
from typing import Optional, List, Tuple, Any
import pandas as pd

# Try to import psycopg2 for PostgreSQL support
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False
    psycopg2 = None

# Database configuration
DB_TYPE = None  # 'sqlite' or 'postgres'
DB_CONFIG = {}


def init_db_config():
    """Initialize database configuration from environment or Streamlit secrets."""
    global DB_TYPE, DB_CONFIG
    
    # Try to get Supabase/PostgreSQL config
    supabase_url = None
    supabase_key = None
    database_url = None
    
    # Check Streamlit secrets first
    try:
        import streamlit as st
        if hasattr(st, 'secrets'):
            supabase_url = st.secrets.get("SUPABASE_URL")
            supabase_key = st.secrets.get("SUPABASE_KEY")
            database_url = st.secrets.get("DATABASE_URL")
    except:
        pass
    
    # Fall back to environment variables
    if not database_url:
        database_url = os.environ.get("DATABASE_URL")
    if not supabase_url:
        supabase_url = os.environ.get("SUPABASE_URL")
    if not supabase_key:
        supabase_key = os.environ.get("SUPABASE_KEY")
    
    # Determine database type
    if database_url and HAS_POSTGRES:
        DB_TYPE = 'postgres'
        DB_CONFIG = {'url': database_url}
        print("🐘 Using PostgreSQL database")
    elif supabase_url and supabase_key and HAS_POSTGRES:
        # Build connection string from Supabase URL
        # Supabase URL format: https://xxx.supabase.co
        # Connection: postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
        project_id = supabase_url.replace("https://", "").replace(".supabase.co", "")
        DB_TYPE = 'postgres'
        DB_CONFIG = {
            'host': f"db.{project_id}.supabase.co",
            'port': 5432,
            'database': 'postgres',
            'user': 'postgres',
            'password': supabase_key
        }
        print("🐘 Using Supabase PostgreSQL database")
    else:
        DB_TYPE = 'sqlite'
        # Use /tmp for cloud, local path otherwise
        is_cloud = os.path.exists("/mount/src") or (os.name != 'nt' and os.path.exists("/tmp"))
        db_path = "/tmp/portfolio.db" if is_cloud else "portfolio.db"
        DB_CONFIG = {'path': db_path}
        print(f"📁 Using SQLite database: {db_path}")
    
    return DB_TYPE


# Initialize on module load
init_db_config()


@contextmanager
def get_connection():
    """Get a database connection (context manager)."""
    conn = None
    try:
        if DB_TYPE == 'postgres':
            if 'url' in DB_CONFIG:
                conn = psycopg2.connect(DB_CONFIG['url'])
            else:
                conn = psycopg2.connect(**DB_CONFIG)
        else:
            conn = sqlite3.connect(DB_CONFIG['path'], check_same_thread=False)
        yield conn
    finally:
        if conn:
            conn.close()


def get_conn():
    """Get a database connection (non-context manager, for compatibility)."""
    if DB_TYPE == 'postgres':
        if 'url' in DB_CONFIG:
            return psycopg2.connect(DB_CONFIG['url'])
        else:
            return psycopg2.connect(**DB_CONFIG)
    else:
        return sqlite3.connect(DB_CONFIG['path'], check_same_thread=False)


def get_placeholder():
    """Get the parameter placeholder for the current database type."""
    return "%s" if DB_TYPE == 'postgres' else "?"


def convert_sql(sql: str) -> str:
    """Convert SQLite SQL to PostgreSQL compatible SQL."""
    if DB_TYPE == 'postgres':
        # Replace ? with %s for parameters
        sql = sql.replace("?", "%s")
        
        # Replace AUTOINCREMENT with SERIAL
        sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        sql = sql.replace("integer PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        
        # Replace INTEGER with proper types
        sql = sql.replace("INTEGER NOT NULL", "INTEGER NOT NULL")
        
        # Handle PRAGMA (SQLite specific) - return empty for postgres
        if sql.strip().upper().startswith("PRAGMA"):
            return ""
        
    return sql


def query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    """Execute a SELECT query and return a DataFrame."""
    import traceback
    
    sql = convert_sql(sql)
    if not sql:  # PRAGMA commands return empty
        return pd.DataFrame()
    
    with get_connection() as conn:
        try:
            df = pd.read_sql_query(sql, conn, params=params)
            return df
        except Exception as e:
            print("SQL ERROR:", repr(e))
            print("SQL WAS:\n", sql)
            print("PARAMS:", params)
            print(traceback.format_exc())
            raise


def query_val(sql: str, params: tuple = ()) -> Any:
    """Execute a query and return a single scalar value."""
    sql = convert_sql(sql)
    if not sql:
        return None
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        res = cur.fetchone()
        return res[0] if res else None


def exec_sql(sql: str, params: tuple = ()):
    """Execute a SQL statement (INSERT, UPDATE, DELETE)."""
    sql = convert_sql(sql)
    if not sql:
        return
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()


def table_exists(table_name: str) -> bool:
    """Check if a table exists."""
    with get_connection() as conn:
        cur = conn.cursor()
        if DB_TYPE == 'postgres':
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = %s
                )
            """, (table_name,))
        else:
            cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (table_name,)
            )
        result = cur.fetchone()
        return bool(result[0] if result else False)


def table_columns(table_name: str) -> set:
    """Get column names for a table."""
    with get_connection() as conn:
        cur = conn.cursor()
        if DB_TYPE == 'postgres':
            cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
            """, (table_name,))
            return {row[0] for row in cur.fetchall()}
        else:
            cur.execute(f"PRAGMA table_info({table_name})")
            return {row[1] for row in cur.fetchall()}


def add_column_if_missing(table: str, col: str, coltype: str):
    """Add a column to a table if it doesn't exist."""
    cols = table_columns(table)
    if col not in cols:
        # Convert SQLite types to PostgreSQL
        pg_type = coltype
        if DB_TYPE == 'postgres':
            pg_type = coltype.replace("INTEGER", "INTEGER")
            pg_type = pg_type.replace("REAL", "DOUBLE PRECISION")
            pg_type = pg_type.replace("TEXT", "TEXT")
        
        with get_connection() as conn:
            cur = conn.cursor()
            sql = f"ALTER TABLE {table} ADD COLUMN {col} {pg_type}"
            cur.execute(sql)
            conn.commit()


def get_last_insert_id(cur) -> int:
    """Get the last inserted ID."""
    if DB_TYPE == 'postgres':
        cur.execute("SELECT lastval()")
        return cur.fetchone()[0]
    else:
        return cur.lastrowid


# PostgreSQL specific initialization
def init_postgres_schema():
    """Create PostgreSQL schema if using Supabase."""
    if DB_TYPE != 'postgres':
        return
    
    with get_connection() as conn:
        cur = conn.cursor()
        
        # Users table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT,
                created_at INTEGER NOT NULL
            )
        """)
        
        # Password resets
        cur.execute("""
            CREATE TABLE IF NOT EXISTS password_resets (
                email TEXT NOT NULL,
                otp TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        
        # User sessions
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        
        # Cash deposits
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cash_deposits (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                portfolio TEXT DEFAULT 'KFH',
                bank_name TEXT NOT NULL,
                deposit_date TEXT NOT NULL,
                amount DOUBLE PRECISION NOT NULL,
                description TEXT,
                comments TEXT,
                currency TEXT DEFAULT 'KWD',
                include_in_analysis INTEGER DEFAULT 1,
                created_at INTEGER NOT NULL
            )
        """)
        
        # Portfolio cash
        cur.execute("""
            CREATE TABLE IF NOT EXISTS portfolio_cash (
                portfolio TEXT,
                user_id INTEGER,
                balance DOUBLE PRECISION,
                currency TEXT DEFAULT 'KWD',
                last_updated INTEGER,
                PRIMARY KEY (portfolio, user_id)
            )
        """)
        
        # Stocks
        cur.execute("""
            CREATE TABLE IF NOT EXISTS stocks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER DEFAULT 1,
                symbol TEXT NOT NULL,
                name TEXT,
                current_price DOUBLE PRECISION DEFAULT 0,
                portfolio TEXT DEFAULT 'KFH',
                currency TEXT DEFAULT 'KWD',
                tradingview_symbol TEXT,
                tradingview_exchange TEXT,
                UNIQUE(symbol, user_id)
            )
        """)
        
        # Transactions
        cur.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                portfolio TEXT DEFAULT 'KFH',
                stock_symbol TEXT NOT NULL,
                txn_date TEXT NOT NULL,
                txn_type TEXT NOT NULL,
                purchase_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
                sell_value DOUBLE PRECISION NOT NULL DEFAULT 0,
                shares DOUBLE PRECISION NOT NULL DEFAULT 0,
                bonus_shares DOUBLE PRECISION NOT NULL DEFAULT 0,
                cash_dividend DOUBLE PRECISION NOT NULL DEFAULT 0,
                reinvested_dividend DOUBLE PRECISION NOT NULL DEFAULT 0,
                price_override DOUBLE PRECISION,
                planned_cum_shares DOUBLE PRECISION,
                fees DOUBLE PRECISION DEFAULT 0,
                broker TEXT,
                reference TEXT,
                notes TEXT,
                category TEXT DEFAULT 'portfolio',
                created_at INTEGER NOT NULL
            )
        """)
        
        # Trading history
        cur.execute("""
            CREATE TABLE IF NOT EXISTS trading_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                stock_symbol TEXT NOT NULL,
                txn_date TEXT NOT NULL,
                txn_type TEXT NOT NULL,
                purchase_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
                sell_value DOUBLE PRECISION NOT NULL DEFAULT 0,
                shares DOUBLE PRECISION NOT NULL DEFAULT 0,
                cash_dividend DOUBLE PRECISION NOT NULL DEFAULT 0,
                bonus_shares DOUBLE PRECISION NOT NULL DEFAULT 0,
                notes TEXT,
                created_at INTEGER NOT NULL
            )
        """)
        
        conn.commit()
        print("✅ PostgreSQL schema initialized")


# Export database type for checking
def is_postgres() -> bool:
    return DB_TYPE == 'postgres'

def is_sqlite() -> bool:
    return DB_TYPE == 'sqlite'

def get_db_type() -> str:
    return DB_TYPE
