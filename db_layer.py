"""
Database Abstraction Layer for Portfolio App
Supports both SQLite (local development) and PostgreSQL (DigitalOcean/Supabase for production)

Usage:
    - Local: Uses SQLite automatically (portfolio.db)
    - Cloud: Set DATABASE_URL environment variable (DigitalOcean sets this automatically)
    
Priority for database detection:
    1. os.environ["DATABASE_URL"] (DigitalOcean Managed Database)
    2. os.environ["db-portfolio"] or similar component-named variables
    3. Streamlit secrets DATABASE_URL
    4. Streamlit secrets SUPABASE_URL + SUPABASE_KEY
    5. Fallback to SQLite (ONLY in local development, raises error in production)
"""

import os
import sqlite3
import sys
from contextlib import contextmanager
from typing import Optional, List, Tuple, Any
import pandas as pd
from urllib.parse import urlparse

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
IS_PRODUCTION = False  # Track if we're running in cloud environment


def _detect_production_environment():
    """Detect if we're running in a production cloud environment."""
    indicators = [
        os.path.exists("/mount/src"),  # Streamlit Cloud
        os.environ.get("DIGITALOCEAN_APP_PLATFORM"),  # DigitalOcean App Platform
        os.environ.get("DYNO"),  # Heroku
        os.environ.get("RENDER"),  # Render
        os.environ.get("RAILWAY_ENVIRONMENT"),  # Railway
        os.environ.get("VERCEL"),  # Vercel
        os.environ.get("AWS_LAMBDA_FUNCTION_NAME"),  # AWS Lambda
        os.environ.get("GOOGLE_CLOUD_PROJECT"),  # Google Cloud
    ]
    return any(indicators)


def _find_database_url():
    """Search for DATABASE_URL in multiple locations.
    
    DigitalOcean App Platform may use component-specific variable names.
    """
    # Check common DATABASE_URL patterns
    url_candidates = [
        os.environ.get("DATABASE_URL"),
        os.environ.get("DATABASE"),
        os.environ.get("POSTGRES_URL"),
        os.environ.get("POSTGRESQL_URL"),
    ]
    
    # Check for DigitalOcean component-specific variables (e.g., db-portfolio)
    for key, value in os.environ.items():
        key_lower = key.lower()
        if value and isinstance(value, str):
            # Check if value looks like a postgres URL
            if value.startswith("postgres://") or value.startswith("postgresql://"):
                url_candidates.append(value)
            # Check for keys that might be database connections
            elif "database" in key_lower or "postgres" in key_lower or key_lower.startswith("db"):
                if "://" in value:
                    url_candidates.append(value)
    
    # Check Streamlit secrets
    try:
        import streamlit as st
        if hasattr(st, 'secrets'):
            if st.secrets.get("DATABASE_URL"):
                url_candidates.append(st.secrets.get("DATABASE_URL"))
    except:
        pass
    
    # Return first valid URL found
    for url in url_candidates:
        if url and isinstance(url, str) and len(url) > 10:
            if "postgres" in url.lower() or "postgresql" in url.lower():
                return url
    
    return None


def _log_db_connection(db_type: str, url_or_path: str):
    """Log database connection info safely (without passwords)."""
    if db_type == 'postgres' and url_or_path:
        try:
            parsed = urlparse(url_or_path)
            host = parsed.hostname or "unknown"
            port = parsed.port or 5432
            dbname = parsed.path.lstrip('/') if parsed.path else "unknown"
            user = parsed.username or "unknown"
            print(f"🐘 DATABASE CONNECTED:")
            print(f"   Driver: PostgreSQL (psycopg2)")
            print(f"   Host: {host}")
            print(f"   Port: {port}")
            print(f"   Database: {dbname}")
            print(f"   User: {user}")
            print(f"   SSL: {'require' in url_or_path}")
        except Exception as e:
            print(f"🐘 Using PostgreSQL database (could not parse URL details: {e})")
    else:
        print(f"📁 DATABASE CONNECTED:")
        print(f"   Driver: SQLite")
        print(f"   Path: {url_or_path}")


def init_db_config():
    """Initialize database configuration from environment or Streamlit secrets.
    
    CRITICAL: In production environments, this will FAIL if no PostgreSQL 
    connection is available, to prevent silent data loss to ephemeral SQLite.
    
    Priority:
    1. os.environ["DATABASE_URL"] - DigitalOcean sets this for managed databases
    2. Component-specific environment variables
    3. Streamlit secrets DATABASE_URL
    4. Streamlit secrets SUPABASE_URL + SUPABASE_KEY  
    5. Fallback to SQLite (LOCAL DEVELOPMENT ONLY)
    """
    global DB_TYPE, DB_CONFIG, IS_PRODUCTION
    
    IS_PRODUCTION = _detect_production_environment()
    database_url = _find_database_url()
    
    # Also check for Supabase credentials
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    
    try:
        import streamlit as st
        if hasattr(st, 'secrets'):
            supabase_url = supabase_url or st.secrets.get("SUPABASE_URL")
            supabase_key = supabase_key or st.secrets.get("SUPABASE_KEY")
    except:
        pass
    
    # ===== ATTEMPT POSTGRESQL CONNECTION =====
    if database_url:
        if not HAS_POSTGRES:
            error_msg = """
╔══════════════════════════════════════════════════════════════════╗
║  CRITICAL ERROR: PostgreSQL driver (psycopg2) not installed!    ║
║                                                                  ║
║  DATABASE_URL is set but psycopg2 is not available.            ║
║  Install with: pip install psycopg2-binary                      ║
╚══════════════════════════════════════════════════════════════════╝
"""
            print(error_msg)
            if IS_PRODUCTION:
                raise RuntimeError("PostgreSQL driver not installed but DATABASE_URL is set")
        
        # Normalize postgres:// to postgresql:// for SQLAlchemy/psycopg2 compatibility
        database_url = database_url.strip()
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        
        if database_url.startswith("postgresql://"):
            DB_TYPE = 'postgres'
            DB_CONFIG = {'url': database_url}
            _log_db_connection('postgres', database_url)
            return DB_TYPE
        else:
            print(f"⚠️ DATABASE_URL found but doesn't look like PostgreSQL: {database_url[:30]}...")
    
    # ===== ATTEMPT SUPABASE CONNECTION =====
    if supabase_url and supabase_key and HAS_POSTGRES:
        project_id = supabase_url.replace("https://", "").replace(".supabase.co", "")
        DB_TYPE = 'postgres'
        DB_CONFIG = {
            'host': f"db.{project_id}.supabase.co",
            'port': 5432,
            'database': 'postgres',
            'user': 'postgres',
            'password': supabase_key
        }
        print("🐘 DATABASE CONNECTED:")
        print(f"   Driver: PostgreSQL (Supabase)")
        print(f"   Host: db.{project_id}.supabase.co")
        print(f"   Database: postgres")
        return DB_TYPE
    
    # ===== PRODUCTION WITHOUT DATABASE - FATAL ERROR =====
    if IS_PRODUCTION:
        error_msg = """
╔══════════════════════════════════════════════════════════════════════════╗
║  CRITICAL ERROR: No PostgreSQL database configured in production!       ║
║                                                                          ║
║  Your app is running in a cloud environment but no DATABASE_URL is set. ║
║  Using SQLite would cause DATA LOSS on each deployment.                 ║
║                                                                          ║
║  To fix:                                                                 ║
║  1. Go to DigitalOcean App Platform → Your App → Settings              ║
║  2. Add environment variable: DATABASE_URL                              ║
║  3. Value: postgresql://user:pass@host:port/dbname?sslmode=require     ║
║                                                                          ║
║  Or attach a Dev Database component to your app.                        ║
╚══════════════════════════════════════════════════════════════════════════╝
"""
        print(error_msg, file=sys.stderr)
        raise RuntimeError(
            "CRITICAL: No PostgreSQL database configured. "
            "Set DATABASE_URL environment variable to prevent data loss. "
            "Refusing to use ephemeral SQLite in production."
        )
    
    # ===== LOCAL DEVELOPMENT - SQLite OK =====
    DB_TYPE = 'sqlite'
    db_path = "portfolio.db"
    DB_CONFIG = {'path': db_path}
    _log_db_connection('sqlite', db_path)
    print("   ℹ️  This is OK for local development only.")
    
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
    except psycopg2.OperationalError as e:
        error_msg = f"""
╔══════════════════════════════════════════════════════════════════╗
║  DATABASE CONNECTION FAILED                                      ║
╚══════════════════════════════════════════════════════════════════╝
Error: {str(e)[:60]}

Possible causes:
1. Database server is not running or unreachable
2. Incorrect credentials in DATABASE_URL
3. Network/firewall blocking connection
4. SSL certificate issues (try adding ?sslmode=require)
"""
        print(error_msg, file=sys.stderr)
        raise
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