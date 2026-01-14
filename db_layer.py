"""
Database Abstraction Layer for Portfolio App
Supports both SQLite (local development) and PostgreSQL (DigitalOcean/Supabase for production)

Usage:
    - Local: Uses SQLite automatically (portfolio.db)
    - Cloud: Set DATABASE_URL environment variable (DigitalOcean sets this automatically)
    
Priority for database detection:
    1. os.environ["DATABASE_URL"] (DigitalOcean Managed Database)
    2. Streamlit secrets DATABASE_URL
    3. Streamlit secrets SUPABASE_URL + SUPABASE_KEY
    4. Fallback to SQLite (portfolio.db)
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
    """Initialize database configuration from environment or Streamlit secrets.
    
    Priority:
    1. os.environ["DATABASE_URL"] - DigitalOcean sets this for managed databases
    2. Streamlit secrets DATABASE_URL
    3. Streamlit secrets SUPABASE_URL + SUPABASE_KEY  
    4. Fallback to SQLite
    """
    global DB_TYPE, DB_CONFIG
    
    database_url = None
    supabase_url = None
    supabase_key = None
    
    # PRIORITY 1: Check environment variable first (DigitalOcean sets DATABASE_URL)
    database_url = os.environ.get("DATABASE_URL")
    
    # PRIORITY 2: Check Streamlit secrets
    if not database_url:
        try:
            import streamlit as st
            if hasattr(st, 'secrets'):
                database_url = st.secrets.get("DATABASE_URL")
                supabase_url = st.secrets.get("SUPABASE_URL")
                supabase_key = st.secrets.get("SUPABASE_KEY")
        except:
            pass
    
    # PRIORITY 3: Environment variables for Supabase
    if not supabase_url:
        supabase_url = os.environ.get("SUPABASE_URL")
    if not supabase_key:
        supabase_key = os.environ.get("SUPABASE_KEY")
    
    # Determine database type and configure
    if database_url and HAS_POSTGRES:
        # Validate the URL is not empty or malformed
        database_url = database_url.strip() if database_url else None
        
        if not database_url or len(database_url) < 10:
            print(f"⚠️ DATABASE_URL is empty or invalid, falling back to SQLite")
            DB_TYPE = 'sqlite'
            db_path = "/tmp/portfolio.db" if os.path.exists("/mount/src") else "portfolio.db"
            DB_CONFIG = {'path': db_path}
            print(f"📁 Using SQLite database: {db_path}")
            return DB_TYPE
        
        # Handle DigitalOcean's postgres:// vs postgresql:// URL scheme
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        
        # Validate URL starts with postgresql://
        if not database_url.startswith("postgresql://"):
            print(f"⚠️ DATABASE_URL doesn't look like a PostgreSQL URL, falling back to SQLite")
            DB_TYPE = 'sqlite'
            db_path = "/tmp/portfolio.db" if os.path.exists("/mount/src") else "portfolio.db"
            DB_CONFIG = {'path': db_path}
            print(f"📁 Using SQLite database: {db_path}")
            return DB_TYPE
        
        DB_TYPE = 'postgres'
        DB_CONFIG = {'url': database_url}
        print("🐘 Using PostgreSQL database (DATABASE_URL)")
        
    elif supabase_url and supabase_key and HAS_POSTGRES:
        # Build connection string from Supabase URL
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
        # Use appropriate path based on environment
        is_cloud = os.path.exists("/mount/src") or os.environ.get("DIGITALOCEAN_APP_PLATFORM")
        if is_cloud:
            db_path = "/tmp/portfolio.db"  # Temporary - won't persist!
            print("⚠️  WARNING: Using SQLite on cloud - data will NOT persist!")
        else:
            db_path = "portfolio.db"
        DB_CONFIG = {'path': db_path}
        print(f"📁 Using SQLite database: {db_path}")
    
    return DB_TYPE
    
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
                url = DB_CONFIG['url']
                if not url or not url.strip():
                    raise ValueError("DATABASE_URL is empty or not configured")
                conn = psycopg2.connect(url)
            else:
                conn = psycopg2.connect(**DB_CONFIG)
        else:
            conn = sqlite3.connect(DB_CONFIG['path'], check_same_thread=False)
        yield conn
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        print(f"   DB_TYPE: {DB_TYPE}")
        print(f"   DB_CONFIG keys: {list(DB_CONFIG.keys()) if DB_CONFIG else 'None'}")
        raise
    finally:
        if conn:
            conn.close()


def get_conn():
    """Get a database connection (non-context manager, for compatibility)."""
    if DB_TYPE == 'postgres':
        if 'url' in DB_CONFIG:
            url = DB_CONFIG['url']
            if not url or not url.strip():
                raise ValueError("DATABASE_URL is empty or not configured")
            return psycopg2.connect(url)
        else:
            return psycopg2.connect(**DB_CONFIG)
    else:
        return sqlite3.connect(DB_CONFIG['path'], check_same_thread=False)


def get_placeholder():
    """Get the parameter placeholder for the current database type."""
    return "%s" if DB_TYPE == 'postgres' else "?"


def convert_sql(sql: str) -> str:
    """Convert SQLite SQL to PostgreSQL compatible SQL.
    
    Handles:
    - Parameter placeholders: ? -> %s
    - AUTOINCREMENT -> SERIAL
    - PRAGMA commands (SQLite only)
    - Boolean handling
    """
    if DB_TYPE == 'postgres':
        # Replace ? with %s for parameters (careful not to replace inside strings)
        # Simple approach - works for most cases
        sql = sql.replace("?", "%s")
        
        # Replace AUTOINCREMENT with SERIAL
        sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        sql = sql.replace("integer PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        sql = sql.replace("INTEGER PRIMARY KEY", "SERIAL PRIMARY KEY")
        
        # Handle SQLite's last_insert_rowid()
        sql = sql.replace("last_insert_rowid()", "lastval()")
        
        # Handle PRAGMA (SQLite specific) - return empty for postgres
        if sql.strip().upper().startswith("PRAGMA"):
            return ""
        
        # Handle datetime functions
        sql = sql.replace("datetime('now')", "NOW()")
        sql = sql.replace("date('now')", "CURRENT_DATE")
        
        # Handle IFNULL -> COALESCE
        sql = sql.replace("IFNULL(", "COALESCE(")
        sql = sql.replace("ifnull(", "COALESCE(")
        
    return sql


def convert_params(params: tuple) -> tuple:
    """Convert parameters for the current database type.
    
    PostgreSQL is stricter about types, so we ensure proper conversion.
    """
    if DB_TYPE != 'postgres':
        return params
    
    converted = []
    for p in params:
        if isinstance(p, bool):
            converted.append(p)  # PostgreSQL handles bool natively
        elif p is None:
            converted.append(None)
        else:
            converted.append(p)
    return tuple(converted)


def query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    """Execute a SELECT query and return a DataFrame."""
    import traceback
    
    sql = convert_sql(sql)
    params = convert_params(params)
    
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
    params = convert_params(params)
    
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
    params = convert_params(params)
    
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


def execute_with_cursor(conn, cur, sql: str, params: tuple = ()):
    """Execute SQL with automatic conversion for the current database type.
    
    Use this for raw cursor.execute() calls that need ? to %s conversion.
    """
    sql = convert_sql(sql)
    params = convert_params(params)
    cur.execute(sql, params)
    return cur


def query_one(sql: str, params: tuple = ()) -> Optional[tuple]:
    """Execute a query and return a single row."""
    sql = convert_sql(sql)
    params = convert_params(params)
    
    if not sql:
        return None
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur.fetchone()


def query_all(sql: str, params: tuple = ()) -> List[tuple]:
    """Execute a query and return all rows."""
    sql = convert_sql(sql)
    params = convert_params(params)
    
    if not sql:
        return []
    
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur.fetchall()


# Re-export convert_sql for use in ui.py where raw cursor access is needed
__all__ = [
    'get_conn', 'get_connection', 'get_placeholder',
    'convert_sql', 'convert_params',
    'query_df', 'query_val', 'query_one', 'query_all', 'exec_sql',
    'table_exists', 'table_columns', 'add_column_if_missing',
    'get_last_insert_id', 'init_postgres_schema',
    'is_postgres', 'is_sqlite', 'get_db_type',
    'execute_with_cursor', 'HAS_POSTGRES', 'DB_TYPE'
]