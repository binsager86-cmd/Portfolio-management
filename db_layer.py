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
import warnings
from contextlib import contextmanager
from typing import Optional, List, Tuple, Any
import pandas as pd
from urllib.parse import urlparse

# Suppress Pandas/SQLAlchemy warnings
warnings.filterwarnings('ignore', category=UserWarning, module='pandas')

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
        
        # Remove any 'options' parameter that might specify an invalid schema
        # Heroku/DigitalOcean sometimes add options=-c search_path=<schema> which causes InvalidSchemaName
        # Handle both URL-encoded (%3D) and plain (=) versions
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse, unquote
        
        try:
            parsed = urlparse(database_url)
            query_params = parse_qs(parsed.query)
            
            # Remove 'options' from query parameters
            modified = False
            if 'options' in query_params:
                del query_params['options']
                modified = True
            
            # Ensure sslmode=require for DigitalOcean/production databases
            if 'sslmode' not in query_params:
                query_params['sslmode'] = ['require']
                modified = True
                print("ℹ️ Added sslmode=require for secure database connection")
            
            if modified:
                new_query = urlencode(query_params, doseq=True)
                database_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
                print("⚠️ Modified DATABASE_URL parameters for compatibility")
        except Exception as e:
            print(f"⚠️ Could not parse DATABASE_URL for cleanup: {e}")
        
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
                
                # Parse the URL and remove any 'options' parameter that might cause issues
                from urllib.parse import urlparse, parse_qs, urlencode, urlunparse, quote
                parsed = urlparse(url)
                query_params = parse_qs(parsed.query)
                
                # Remove existing 'options' to avoid schema conflicts
                if 'options' in query_params:
                    del query_params['options']
                
                # Ensure sslmode=require for DigitalOcean/production databases
                if 'sslmode' not in query_params:
                    query_params['sslmode'] = ['require']
                
                # Rebuild URL WITHOUT adding options to avoid URL encoding issues
                # We'll set search_path after connection instead
                new_query = urlencode(query_params, doseq=True)
                clean_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
                
                conn = psycopg2.connect(clean_url)
                # Set search_path after connection to avoid URL encoding issues
                with conn.cursor() as cur:
                    cur.execute("SET search_path TO public")
                conn.commit()
            else:
                # Connect with explicit options for public schema
                config_with_options = DB_CONFIG.copy()
                config_with_options['options'] = '-c search_path=public'
                config_with_options['sslmode'] = 'require'
                conn = psycopg2.connect(**config_with_options)
        else:
            conn = sqlite3.connect(DB_CONFIG['path'], check_same_thread=False)
        yield conn
    except psycopg2.OperationalError as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
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
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
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
            
            # Parse the URL and remove any 'options' parameter that might cause issues
            from urllib.parse import urlparse, parse_qs, urlencode, urlunparse, quote
            parsed = urlparse(url)
            query_params = parse_qs(parsed.query)
            
            # Remove existing 'options' to avoid schema conflicts
            if 'options' in query_params:
                del query_params['options']
            
            # Ensure sslmode=require for DigitalOcean/production databases
            if 'sslmode' not in query_params:
                query_params['sslmode'] = ['require']
            
            # Rebuild URL WITHOUT adding options to avoid URL encoding issues
            # We'll set search_path after connection instead
            new_query = urlencode(query_params, doseq=True)
            clean_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
            
            conn = psycopg2.connect(clean_url)
            # Set search_path after connection to avoid URL encoding issues
            with conn.cursor() as cur:
                cur.execute("SET search_path TO public")
            conn.commit()
        else:
            # Connect with explicit options for public schema
            config_with_options = DB_CONFIG.copy()
            config_with_options['options'] = '-c search_path=public'
            config_with_options['sslmode'] = 'require'
            conn = psycopg2.connect(**config_with_options)
        return conn
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
        
        # Handle INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
        if "INSERT OR IGNORE INTO" in sql:
            sql = sql.replace("INSERT OR IGNORE INTO", "INSERT INTO")
            # Append ON CONFLICT DO NOTHING before the end of the statement
            if "ON CONFLICT" not in sql.upper():
                # Add before trailing semicolon or at end
                sql = sql.rstrip().rstrip(';')
                sql += " ON CONFLICT DO NOTHING"
        
        # Handle COLLATE NOCASE (SQLite-only, remove for PostgreSQL)
        # PostgreSQL text comparisons are case-sensitive by default,
        # but our queries already use UPPER() or we handle at app level
        sql = sql.replace(" COLLATE NOCASE", "")
        
        # Handle INSERT OR REPLACE -> INSERT ... ON CONFLICT DO UPDATE
        # Note: This is a generic fallback. For proper upserts, handle at call site.
        if "INSERT OR REPLACE INTO" in sql:
            sql = sql.replace("INSERT OR REPLACE INTO", "INSERT INTO")
            if "ON CONFLICT" not in sql.upper():
                sql = sql.rstrip().rstrip(';')
                sql += " ON CONFLICT DO NOTHING"
        
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
    """Execute a SELECT query and return a DataFrame.
    
    Uses cursor-based approach for PostgreSQL to avoid the pandas 2.x
    deprecation warning / silent failures with raw DBAPI2 connections.
    Falls back to pd.read_sql_query for SQLite (which still works fine).
    """
    import traceback
    
    sql = convert_sql(sql)
    params = convert_params(params)
    
    if not sql:  # PRAGMA commands return empty
        return pd.DataFrame()
    
    with get_connection() as conn:
        try:
            if DB_TYPE == 'postgres':
                # Use cursor-based fetch to avoid pandas 2.x psycopg2 warning
                cur = conn.cursor()
                cur.execute(sql, params)
                rows = cur.fetchall()
                if not rows:
                    return pd.DataFrame()
                col_names = [desc[0] for desc in cur.description]
                return pd.DataFrame(rows, columns=col_names)
            else:
                # SQLite works fine with pd.read_sql_query
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
    """Create PostgreSQL schema if using Supabase.
    
    Uses SAVEPOINTs to isolate each DDL statement so that a single
    failure (e.g. column type mismatch, missing FK target) does NOT
    abort the entire transaction — the classic PostgreSQL
    'current transaction is aborted' error.
    """
    if DB_TYPE != 'postgres':
        return
    
    def _safe_execute(cur, sql, label=""):
        """Execute SQL inside a SAVEPOINT so failures are isolated."""
        sp = f"sp_{label}" if label else "sp_safe"
        try:
            cur.execute(f"SAVEPOINT {sp}")
            cur.execute(sql)
            cur.execute(f"RELEASE SAVEPOINT {sp}")
        except Exception as exc:
            cur.execute(f"ROLLBACK TO SAVEPOINT {sp}")
            if label:
                print(f"  ⚠️ Skipped {label}: {str(exc)[:80]}")

    with get_connection() as conn:
        cur = conn.cursor()
        
        # ── Core portfolio tables (order matters for FK deps) ────
        _core_tables = [
            ("users", """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT UNIQUE,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    name TEXT,
                    created_at INTEGER NOT NULL
                )
            """),
            ("password_resets", """
                CREATE TABLE IF NOT EXISTS password_resets (
                    email TEXT NOT NULL,
                    otp TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """),
            ("user_sessions", """
                CREATE TABLE IF NOT EXISTS user_sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    expires_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """),
            ("cash_deposits", """
                CREATE TABLE IF NOT EXISTS cash_deposits (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    portfolio TEXT DEFAULT 'KFH',
                    source TEXT DEFAULT 'MANUAL',
                    source_reference TEXT,
                    deposit_date TEXT NOT NULL,
                    amount DOUBLE PRECISION NOT NULL,
                    bank_name TEXT NOT NULL DEFAULT 'Cash Deposit',
                    description TEXT,
                    comments TEXT,
                    notes TEXT,
                    currency TEXT DEFAULT 'KWD',
                    include_in_analysis INTEGER DEFAULT 1,
                    fx_rate_at_deposit DOUBLE PRECISION,
                    is_deleted INTEGER DEFAULT 0,
                    deleted_at INTEGER,
                    deleted_by INTEGER,
                    created_at INTEGER NOT NULL
                )
            """),
            ("portfolio_cash", """
                CREATE TABLE IF NOT EXISTS portfolio_cash (
                    portfolio TEXT,
                    user_id INTEGER,
                    balance DOUBLE PRECISION,
                    currency TEXT DEFAULT 'KWD',
                    last_updated INTEGER,
                    manual_override INTEGER DEFAULT 0,
                    PRIMARY KEY (portfolio, user_id)
                )
            """),
            ("stocks", """
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
                    last_updated INTEGER,
                    price_source TEXT,
                    created_at INTEGER,
                    UNIQUE(symbol, user_id)
                )
            """),
            ("transactions", """
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
                    security_id TEXT,
                    source TEXT DEFAULT 'MANUAL',
                    source_reference TEXT,
                    is_deleted INTEGER DEFAULT 0,
                    deleted_at INTEGER,
                    deleted_by INTEGER,
                    avg_cost_at_txn DOUBLE PRECISION,
                    realized_pnl_at_txn DOUBLE PRECISION,
                    cost_basis_at_txn DOUBLE PRECISION,
                    shares_held_at_txn DOUBLE PRECISION,
                    stock_master_id INTEGER,
                    portfolio_id INTEGER,
                    account_id INTEGER,
                    created_at INTEGER NOT NULL
                )
            """),
            ("trading_history", """
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
            """),
            ("portfolio_snapshots", """
                CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    snapshot_date TEXT NOT NULL,
                    portfolio_value DOUBLE PRECISION DEFAULT 0,
                    daily_movement DOUBLE PRECISION DEFAULT 0,
                    beginning_difference DOUBLE PRECISION DEFAULT 0,
                    deposit_cash DOUBLE PRECISION DEFAULT 0,
                    accumulated_cash DOUBLE PRECISION DEFAULT 0,
                    net_gain DOUBLE PRECISION DEFAULT 0,
                    change_percent DOUBLE PRECISION DEFAULT 0,
                    roi_percent DOUBLE PRECISION DEFAULT 0,
                    twr_percent DOUBLE PRECISION,
                    mwrr_percent DOUBLE PRECISION,
                    created_at INTEGER,
                    UNIQUE(snapshot_date, user_id)
                )
            """),
            ("cbk_rate_cache", """
                CREATE TABLE IF NOT EXISTS cbk_rate_cache (
                    id SERIAL PRIMARY KEY,
                    rate DOUBLE PRECISION NOT NULL,
                    fetched_date TEXT NOT NULL,
                    source TEXT NOT NULL,
                    created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
                )
            """),
            ("financial_audit_log", """
                CREATE TABLE IF NOT EXISTS financial_audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    operation TEXT NOT NULL,
                    entity_type TEXT,
                    entity_id INTEGER,
                    old_value DOUBLE PRECISION,
                    new_value DOUBLE PRECISION,
                    delta DOUBLE PRECISION,
                    portfolio TEXT,
                    currency TEXT,
                    reason TEXT,
                    details TEXT,
                    created_at INTEGER NOT NULL
                )
            """),
        ]

        for label, sql in _core_tables:
            _safe_execute(cur, sql, f"create_{label}")

        # ── Analysis / Fundamental Analysis tables ───────────────
        _analysis_tables = [
            ("analysis_stocks", """
                CREATE TABLE IF NOT EXISTS analysis_stocks (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    symbol TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    exchange TEXT DEFAULT 'NYSE',
                    currency TEXT DEFAULT 'USD',
                    sector TEXT,
                    industry TEXT,
                    country TEXT,
                    isin TEXT,
                    cik TEXT,
                    description TEXT,
                    website TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(user_id, symbol)
                )
            """),
            ("financial_statements", """
                CREATE TABLE IF NOT EXISTS financial_statements (
                    id SERIAL PRIMARY KEY,
                    stock_id INTEGER NOT NULL REFERENCES analysis_stocks(id),
                    statement_type TEXT NOT NULL,
                    fiscal_year INTEGER NOT NULL,
                    fiscal_quarter INTEGER,
                    period_end_date TEXT NOT NULL,
                    filing_date TEXT,
                    source_file TEXT,
                    extracted_by TEXT DEFAULT 'gemini',
                    confidence_score DOUBLE PRECISION,
                    verified_by_user BOOLEAN DEFAULT FALSE,
                    notes TEXT,
                    created_at INTEGER NOT NULL,
                    UNIQUE(stock_id, statement_type, period_end_date)
                )
            """),
            ("financial_line_items", """
                CREATE TABLE IF NOT EXISTS financial_line_items (
                    id SERIAL PRIMARY KEY,
                    statement_id INTEGER NOT NULL REFERENCES financial_statements(id),
                    line_item_code TEXT NOT NULL,
                    line_item_name TEXT NOT NULL,
                    amount DOUBLE PRECISION NOT NULL,
                    currency TEXT DEFAULT 'USD',
                    order_index INTEGER,
                    parent_item_id INTEGER,
                    is_total BOOLEAN DEFAULT FALSE,
                    manually_edited BOOLEAN DEFAULT FALSE,
                    edited_by_user_id INTEGER,
                    edited_at INTEGER
                )
            """),
            ("stock_metrics", """
                CREATE TABLE IF NOT EXISTS stock_metrics (
                    id SERIAL PRIMARY KEY,
                    stock_id INTEGER NOT NULL REFERENCES analysis_stocks(id),
                    fiscal_year INTEGER NOT NULL,
                    fiscal_quarter INTEGER,
                    period_end_date TEXT NOT NULL,
                    metric_type TEXT NOT NULL,
                    metric_name TEXT NOT NULL,
                    metric_value DOUBLE PRECISION,
                    created_at INTEGER NOT NULL,
                    UNIQUE(stock_id, metric_name, period_end_date)
                )
            """),
            ("valuation_models", """
                CREATE TABLE IF NOT EXISTS valuation_models (
                    id SERIAL PRIMARY KEY,
                    stock_id INTEGER NOT NULL REFERENCES analysis_stocks(id),
                    model_type TEXT NOT NULL,
                    valuation_date TEXT NOT NULL,
                    intrinsic_value DOUBLE PRECISION,
                    parameters TEXT,
                    assumptions TEXT,
                    created_by_user_id INTEGER,
                    created_at INTEGER NOT NULL
                )
            """),
            ("stock_scores", """
                CREATE TABLE IF NOT EXISTS stock_scores (
                    id SERIAL PRIMARY KEY,
                    stock_id INTEGER NOT NULL REFERENCES analysis_stocks(id),
                    scoring_date TEXT NOT NULL,
                    overall_score DOUBLE PRECISION,
                    fundamental_score DOUBLE PRECISION,
                    valuation_score DOUBLE PRECISION,
                    growth_score DOUBLE PRECISION,
                    quality_score DOUBLE PRECISION,
                    details TEXT,
                    analyst_notes TEXT,
                    created_by_user_id INTEGER,
                    created_at INTEGER NOT NULL
                )
            """),
            ("analysis_audit_log", """
                CREATE TABLE IF NOT EXISTS analysis_audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    operation TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id INTEGER,
                    old_value TEXT,
                    new_value TEXT,
                    reason TEXT,
                    details TEXT,
                    created_at INTEGER NOT NULL
                )
            """),
        ]

        for label, sql in _analysis_tables:
            _safe_execute(cur, sql, f"create_{label}")

        # ── Extraction Pipeline (AI Vision) tables ───────────────
        _extraction_tables = [
            ("financial_uploads", """
                CREATE TABLE IF NOT EXISTS financial_uploads (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    stock_id INTEGER NOT NULL REFERENCES analysis_stocks(id),
                    uploaded_at INTEGER NOT NULL,
                    pdf_path TEXT,
                    pdf_type TEXT DEFAULT 'text',
                    status TEXT DEFAULT 'processing',
                    error_message TEXT
                )
            """),
            ("financial_raw_extraction", """
                CREATE TABLE IF NOT EXISTS financial_raw_extraction (
                    id SERIAL PRIMARY KEY,
                    upload_id INTEGER NOT NULL REFERENCES financial_uploads(id),
                    statement_type TEXT,
                    page_num INTEGER,
                    method TEXT,
                    table_id INTEGER,
                    table_json TEXT,
                    header_context TEXT,
                    confidence_score DOUBLE PRECISION DEFAULT 0.0
                )
            """),
            ("financial_normalized", """
                CREATE TABLE IF NOT EXISTS financial_normalized (
                    id SERIAL PRIMARY KEY,
                    upload_id INTEGER NOT NULL REFERENCES financial_uploads(id),
                    statement_type TEXT NOT NULL,
                    period_end_date TEXT,
                    currency TEXT DEFAULT 'USD',
                    unit_scale INTEGER DEFAULT 1,
                    line_item_key TEXT NOT NULL,
                    label_raw TEXT,
                    value DOUBLE PRECISION,
                    source_page INTEGER,
                    source_table_id INTEGER
                )
            """),
            ("financial_validation", """
                CREATE TABLE IF NOT EXISTS financial_validation (
                    id SERIAL PRIMARY KEY,
                    upload_id INTEGER NOT NULL REFERENCES financial_uploads(id),
                    statement_type TEXT,
                    rule_name TEXT NOT NULL,
                    expected_value DOUBLE PRECISION,
                    actual_value DOUBLE PRECISION,
                    diff DOUBLE PRECISION,
                    pass_fail TEXT DEFAULT 'unknown',
                    notes TEXT
                )
            """),
            ("financial_user_edits", """
                CREATE TABLE IF NOT EXISTS financial_user_edits (
                    id SERIAL PRIMARY KEY,
                    upload_id INTEGER NOT NULL REFERENCES financial_uploads(id),
                    statement_type TEXT,
                    period TEXT,
                    line_item_key TEXT NOT NULL,
                    old_value DOUBLE PRECISION,
                    new_value DOUBLE PRECISION,
                    edited_at INTEGER NOT NULL,
                    edited_by INTEGER
                )
            """),
        ]

        for label, sql in _extraction_tables:
            _safe_execute(cur, sql, f"create_{label}")

        # ── Schema version tracking ──────────────────────────────
        _safe_execute(cur, """
            CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL DEFAULT 1,
                migrated_at INTEGER NOT NULL
            )
        """, "create_schema_version")

        # ══════════════════════════════════════════════════════════════
        # Indexes — Analysis & Extraction
        # ══════════════════════════════════════════════════════════════
        _pg_indexes = [
            # Core portfolio
            "CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date)",
            "CREATE INDEX IF NOT EXISTS idx_txn_user_symbol ON transactions(user_id, stock_symbol)",
            "CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions(user_id, txn_date)",
            "CREATE INDEX IF NOT EXISTS idx_audit_user ON financial_audit_log(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_audit_created ON financial_audit_log(created_at)",
            # Analysis
            "CREATE INDEX IF NOT EXISTS idx_analysis_stocks_user ON analysis_stocks(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_analysis_stocks_symbol ON analysis_stocks(symbol)",
            "CREATE INDEX IF NOT EXISTS idx_financial_statements_stock ON financial_statements(stock_id)",
            "CREATE INDEX IF NOT EXISTS idx_financial_statements_type_date ON financial_statements(statement_type, period_end_date)",
            "CREATE INDEX IF NOT EXISTS idx_line_items_statement ON financial_line_items(statement_id)",
            "CREATE INDEX IF NOT EXISTS idx_line_items_code ON financial_line_items(line_item_code)",
            "CREATE INDEX IF NOT EXISTS idx_stock_metrics_stock ON stock_metrics(stock_id)",
            "CREATE INDEX IF NOT EXISTS idx_valuation_models_stock ON valuation_models(stock_id)",
            "CREATE INDEX IF NOT EXISTS idx_stock_scores_stock ON stock_scores(stock_id)",
            # Extraction
            "CREATE INDEX IF NOT EXISTS idx_fin_uploads_user ON financial_uploads(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_fin_uploads_stock ON financial_uploads(stock_id)",
            "CREATE INDEX IF NOT EXISTS idx_fin_raw_upload ON financial_raw_extraction(upload_id)",
            "CREATE INDEX IF NOT EXISTS idx_fin_norm_upload ON financial_normalized(upload_id)",
            "CREATE INDEX IF NOT EXISTS idx_fin_valid_upload ON financial_validation(upload_id)",
            "CREATE INDEX IF NOT EXISTS idx_fin_edits_upload ON financial_user_edits(upload_id)",
        ]
        for idx_sql in _pg_indexes:
            try:
                cur.execute("SAVEPOINT sp_idx")
                cur.execute(idx_sql)
                cur.execute("RELEASE SAVEPOINT sp_idx")
            except Exception:
                cur.execute("ROLLBACK TO SAVEPOINT sp_idx")

        # ══════════════════════════════════════════════════════════════
        # Additive column migrations (ALTER TABLE … ADD COLUMN IF NOT EXISTS)
        # ══════════════════════════════════════════════════════════════
        _pg_additive_cols = [
            # users — Gemini API fields
            ("users", "gemini_api_key",                 "TEXT"),
            ("users", "gemini_api_key_encrypted",       "TEXT"),
            ("users", "gemini_api_key_last_validated",  "INTEGER"),
            ("users", "gemini_quota_reset_at",          "INTEGER"),
            ("users", "gemini_requests_today",          "INTEGER DEFAULT 0"),
            # stocks
            ("stocks", "name",                          "TEXT"),
            ("stocks", "last_updated",                  "INTEGER"),
            ("stocks", "price_source",                  "TEXT"),
            ("stocks", "created_at",                    "INTEGER"),
            # transactions
            ("transactions", "fx_rate_at_txn",          "DOUBLE PRECISION"),
            # portfolio_snapshots
            ("portfolio_snapshots", "twr_percent",      "DOUBLE PRECISION"),
            ("portfolio_snapshots", "mwrr_percent",     "DOUBLE PRECISION"),
            # cash_deposits
            ("cash_deposits", "fx_rate_at_deposit",     "DOUBLE PRECISION"),
            ("cash_deposits", "is_deleted",             "INTEGER DEFAULT 0"),
            ("cash_deposits", "deleted_at",             "INTEGER"),
            ("cash_deposits", "deleted_by",             "INTEGER"),
        ]
        for tbl, col, coltype in _pg_additive_cols:
            try:
                cur.execute("SAVEPOINT sp_col")
                cur.execute(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col} {coltype}")
                cur.execute("RELEASE SAVEPOINT sp_col")
            except Exception:
                cur.execute("ROLLBACK TO SAVEPOINT sp_col")

        # Copy data from company_name to name if company_name exists
        try:
            cur.execute("SAVEPOINT sp_copy")
            cur.execute("UPDATE stocks SET name = company_name WHERE name IS NULL AND company_name IS NOT NULL")
            cur.execute("RELEASE SAVEPOINT sp_copy")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT sp_copy")

        # Ensure UNIQUE constraint on portfolio_snapshots(snapshot_date, user_id)
        # First remove any duplicates (keep the row with the highest id)
        try:
            cur.execute("SAVEPOINT sp_snap_dedup")
            cur.execute("""
                DELETE FROM portfolio_snapshots a
                USING portfolio_snapshots b
                WHERE a.snapshot_date = b.snapshot_date
                  AND a.user_id IS NOT DISTINCT FROM b.user_id
                  AND a.id < b.id
            """)
            cur.execute("RELEASE SAVEPOINT sp_snap_dedup")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT sp_snap_dedup")

        # Now create the unique index (safe after dedup)
        try:
            cur.execute("SAVEPOINT sp_snap_uq")
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_date_user
                ON portfolio_snapshots(snapshot_date, user_id)
            """)
            cur.execute("RELEASE SAVEPOINT sp_snap_uq")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp_snap_uq")
            print(f"  ⚠️ Could not create snapshot unique index: {str(e)[:80]}")

        # Record schema version
        try:
            cur.execute("SAVEPOINT sp_ver")
            cur.execute("""
                INSERT INTO schema_version (id, version, migrated_at)
                VALUES (1, 1, EXTRACT(EPOCH FROM NOW())::INTEGER)
                ON CONFLICT (id) DO UPDATE SET version = 1, migrated_at = EXTRACT(EPOCH FROM NOW())::INTEGER
            """)
            cur.execute("RELEASE SAVEPOINT sp_ver")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT sp_ver")

        conn.commit()
        print("✅ PostgreSQL schema initialized (core + analysis + extraction)")


def init_db_schemas():
    """
    Ensure required database schemas exist.
    This prevents InvalidSchemaName errors when queries reference non-existent schemas.
    Currently, all tables use the 'public' schema, but this ensures it's set correctly.
    """
    if DB_TYPE != 'postgres':
        return  # SQLite doesn't use schemas
    
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Ensure public schema exists (it usually does by default, but be safe)
                cur.execute("CREATE SCHEMA IF NOT EXISTS public;")
                # Set search_path to public
                cur.execute("SET search_path TO public;")
            conn.commit()
        print("✅ Database schemas verified")
    except Exception as e:
        print(f"⚠️ Schema initialization note: {e}")


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