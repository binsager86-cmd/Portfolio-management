# auth_app.py
"""
Lightweight authentication module for Portfolio App.
Loads ONLY essential imports to ensure fast login page load times.

This module handles:
- Login page rendering
- User registration
- Password reset (OTP)
- Session token creation/validation

Heavy libraries (yfinance, pandas for analysis, etc.) are NOT imported here.
"""

import streamlit as st
import sqlite3
import time
import os
import re
import logging
import html
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict

# ====== LOGGING SETUP ======
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ====== DATABASE CONNECTION ======
DATABASE_URL = os.getenv("DATABASE_URL", "")
IS_PRODUCTION = bool(DATABASE_URL)

def is_postgres() -> bool:
    """Check if using PostgreSQL (production) or SQLite (local)."""
    return bool(DATABASE_URL and DATABASE_URL.startswith(("postgres://", "postgresql://")))

def get_conn():
    """Get database connection - PostgreSQL in production, SQLite locally."""
    if is_postgres():
        import psycopg2
        import psycopg2.extras
        conn_str = DATABASE_URL
        if conn_str.startswith("postgres://"):
            conn_str = conn_str.replace("postgres://", "postgresql://", 1)
        if "sslmode" not in conn_str:
            conn_str += "?sslmode=require" if "?" not in conn_str else "&sslmode=require"
        conn = psycopg2.connect(conn_str)
        return conn
    else:
        db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portfolio.db")
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

def db_execute(cursor, sql: str, params: tuple = ()):
    """Execute SQL with proper placeholder translation for PostgreSQL vs SQLite."""
    if is_postgres():
        sql = sql.replace("?", "%s")
    cursor.execute(sql, params)

def get_db_info() -> str:
    """Get database info string for display."""
    if is_postgres():
        return "🐘 PostgreSQL (Production)"
    else:
        return "📁 SQLite (Local Development)"

# ====== PASSWORD HASHING ======
import bcrypt

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def check_password(password: str, stored_hash: str) -> bool:
    """Check password against stored hash."""
    try:
        if isinstance(stored_hash, memoryview):
            stored_hash = bytes(stored_hash).decode('utf-8')
        elif isinstance(stored_hash, bytes):
            stored_hash = stored_hash.decode('utf-8')
        return bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password check error: {e}")
        return False

# ====== SESSION MANAGEMENT ======
import uuid

def create_session_token(user_id: int, days: int = 7) -> Tuple[str, int]:
    """Create a session token for persistent login."""
    token = str(uuid.uuid4())
    expires_at = int(time.time()) + (days * 86400)
    
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Ensure table exists
        if not is_postgres():
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    session_token TEXT NOT NULL UNIQUE,
                    expires_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)
        
        # Clean old sessions for this user
        db_execute(cur, "DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        
        # Insert new session
        db_execute(cur, """
            INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, token, expires_at, int(time.time())))
        
        conn.commit()
    except Exception as e:
        logger.error(f"Session creation error: {e}")
    finally:
        conn.close()
    
    return token, expires_at

def get_user_from_token(token: str) -> Optional[Dict]:
    """Validate session token and return user info."""
    if not token:
        return None
    
    conn = get_conn()
    cur = conn.cursor()
    try:
        db_execute(cur, """
            SELECT u.id, u.username, u.email, s.expires_at
            FROM users u
            JOIN user_sessions s ON u.id = s.user_id
            WHERE s.session_token = ? AND s.expires_at > ?
        """, (token, int(time.time())))
        
        row = cur.fetchone()
        if row:
            if is_postgres():
                return {"id": row[0], "username": row[1], "email": row[2]}
            else:
                return {"id": row["id"], "username": row["username"], "email": row["email"]}
    except Exception as e:
        logger.debug(f"Token validation error: {e}")
    finally:
        conn.close()
    
    return None

# ====== EMAIL OTP (Minimal) ======
def send_otp_email(to_email: str, otp: str):
    """Send OTP email - simulation mode if SMTP not configured."""
    smtp_host = os.getenv("SMTP_HOST") or st.secrets.get("smtp", {}).get("host")
    
    if not smtp_host:
        st.toast(f"🔑 SIMULATION MODE: OTP for {to_email} is {otp}", icon="👀")
        st.info(f"**Dev Mode**: OTP is `{otp}` (Configure SMTP in secrets.toml to send real emails)")
    else:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            smtp_port = int(os.getenv("SMTP_PORT") or st.secrets.get("smtp", {}).get("port", 587))
            smtp_user = os.getenv("SMTP_USER") or st.secrets.get("smtp", {}).get("user", "")
            smtp_pass = os.getenv("SMTP_PASS") or st.secrets.get("smtp", {}).get("password", "")
            
            msg = MIMEMultipart()
            msg['From'] = smtp_user
            msg['To'] = to_email
            msg['Subject'] = "Portfolio App - Password Reset OTP"
            msg.attach(MIMEText(f"Your OTP code is: {otp}\n\nThis code expires in 15 minutes.", 'plain'))
            
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            
            st.success(f"OTP sent to {to_email}")
        except Exception as e:
            logger.error(f"Email send error: {e}")
            st.warning(f"Could not send email. OTP is: `{otp}`")

# ====== LOGIN PAGE ======
def login_page(cookie_manager=None):
    """Render the login/register/forgot-password page."""
    st.markdown("""
    <style>
    .main { align-items: center; justify-content: center; display: flex; }
    .auth-container { max-width: 400px; padding: 2rem; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
    </style>
    """, unsafe_allow_html=True)
    
    st.title("🔐 Portfolio Access")
    
    if "auth_mode" not in st.session_state:
        st.session_state.auth_mode = "login"
    
    # =============================
    # FORGOT PASSWORD MODE
    # =============================
    if st.session_state.auth_mode == "forgot_pass":
        st.subheader("🔄 Reset Password")
        if st.button("← Back to Login"):
            st.session_state.auth_mode = "login"
            st.rerun()
        
        with st.form("reset_request_form"):
            email_reset = st.text_input("Enter your registered email", max_chars=100)
            btn_reset = st.form_submit_button("Send OTP")
            
            if btn_reset:
                now = int(time.time())
                rate_limit_window = 900  # 15 minutes
                max_otp_requests = 3
                
                conn = get_conn()
                cur = conn.cursor()
                
                # Rate limiting
                db_execute(cur, 
                    "SELECT COUNT(*) FROM password_resets WHERE email=? AND created_at > ?",
                    (email_reset, now - rate_limit_window))
                otp_count = cur.fetchone()[0]
                
                if otp_count >= max_otp_requests:
                    conn.close()
                    st.error("⏰ Too many OTP requests. Please wait 15 minutes.")
                else:
                    db_execute(cur, "SELECT id FROM users WHERE email=? OR username=?", (email_reset, email_reset))
                    res = cur.fetchone()
                    conn.close()
                    
                    if res:
                        import random
                        otp_code = str(random.randint(100000, 999999))
                        exp_time = now + 900
                        
                        conn = get_conn()
                        cur = conn.cursor()
                        db_execute(cur, "INSERT INTO password_resets (email, otp, expires_at, created_at) VALUES (?, ?, ?, ?)",
                                   (email_reset, otp_code, exp_time, now))
                        conn.commit()
                        conn.close()
                        
                        send_otp_email(email_reset, otp_code)
                        st.session_state.reset_email = email_reset
                        st.session_state.auth_mode = "verify_otp"
                        st.rerun()
                    else:
                        st.error("Email not found.")
    
    # =============================
    # VERIFY OTP MODE
    # =============================
    elif st.session_state.auth_mode == "verify_otp":
        st.subheader("🔐 Verify OTP")
        st.caption(f"Enter the code sent to {st.session_state.get('reset_email')}")
        
        with st.form("verify_otp_form"):
            otp_input = st.text_input("OTP Code", max_chars=6)
            new_pass_1 = st.text_input("New Password", type="password", max_chars=128)
            new_pass_2 = st.text_input("Confirm New Password", type="password", max_chars=128)
            btn_verify = st.form_submit_button("Reset Password")
            
            if btn_verify:
                if new_pass_1 != new_pass_2:
                    st.error("Passwords do not match")
                elif len(new_pass_1) < 4:
                    st.error("Password too short")
                else:
                    target_email = st.session_state.get("reset_email")
                    now = int(time.time())
                    
                    conn = get_conn()
                    cur = conn.cursor()
                    db_execute(cur, "SELECT otp FROM password_resets WHERE email=? AND expires_at > ?", (target_email, now))
                    row = cur.fetchone()
                    
                    if row and row[0] == otp_input:
                        new_hash = hash_password(new_pass_1)
                        db_execute(cur, "UPDATE users SET password_hash=? WHERE email=? OR username=?", (new_hash, target_email, target_email))
                        db_execute(cur, "DELETE FROM password_resets WHERE email=?", (target_email,))
                        conn.commit()
                        conn.close()
                        st.session_state.auth_mode = "login"
                        st.session_state._password_reset_success = True
                        del st.session_state.reset_email
                        st.rerun()
                    else:
                        conn.close()
                        st.error("Invalid or expired OTP")
        
        if st.button("Cancel"):
            st.session_state.auth_mode = "login"
            st.rerun()
    
    # =============================
    # REGISTER MODE
    # =============================
    elif st.session_state.auth_mode == "register":
        st.subheader("📝 Register")
        if st.button("← Back to Login"):
            st.session_state.auth_mode = "login"
            st.rerun()
        
        with st.form("register_form"):
            reg_email_input = st.text_input("Email Address")
            reg_pass = st.text_input("Choose Password", type="password")
            confirm_pass = st.text_input("Confirm Password", type="password")
            submit_reg = st.form_submit_button("Register", width="stretch")
            
            if submit_reg:
                reg_email = reg_email_input.strip().lower()
                
                if reg_pass != confirm_pass:
                    st.error("Passwords do not match")
                elif len(reg_pass) < 4:
                    st.warning("Password too short")
                elif "@" not in reg_email or "." not in reg_email:
                    st.error("Invalid email format")
                else:
                    try:
                        conn = get_conn()
                        cur = conn.cursor()
                        hashed = hash_password(reg_pass)
                        
                        db_execute(cur, "SELECT id FROM users WHERE email = ? OR username = ?", (reg_email, reg_email))
                        if cur.fetchone():
                            st.error("User with this email already exists.")
                        else:
                            db_execute(cur, "INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)", 
                                       (reg_email, reg_email, hashed, int(time.time())))
                            conn.commit()
                            st.session_state.auth_mode = "login"
                            st.session_state._register_success = True
                            st.rerun()
                    except Exception as e:
                        st.error(f"Registration error: {e}")
                    finally:
                        conn.close()
    
    # =============================
    # LOGIN MODE (Default)
    # =============================
    else:
        st.subheader("🔑 Login")
        
        if st.session_state.pop('_register_success', False):
            st.success("✅ Registered successfully! Please login.")
        if st.session_state.pop('_password_reset_success', False):
            st.success("✅ Password reset successfully! Please login.")
        
        with st.form("login_form"):
            email_login_input = st.text_input("Email")
            password_login = st.text_input("Password", type="password")
            remember_me = st.checkbox("Remember me for 30 days")
            submitted = st.form_submit_button("Login", type="primary", width="stretch")
        
        if submitted:
            email_login = email_login_input.strip().lower()
            
            conn = get_conn()
            cur = conn.cursor()
            try:
                db_execute(cur, "SELECT password_hash, username, id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?", (email_login, email_login))
                row = cur.fetchone()
                
                if row:
                    if is_postgres():
                        stored_hash, db_username, user_id = row[0], row[1], row[2]
                    else:
                        stored_hash, db_username, user_id = row["password_hash"], row["username"], row["id"]
                    
                    if stored_hash is None:
                        st.error("❌ Account exists but no password set. Please use 'Forgot Password'.")
                    elif check_password(password_login, stored_hash):
                        # SUCCESS
                        st.session_state.logged_in = True
                        st.session_state.user_id = user_id
                        st.session_state.username = db_username
                        st.session_state._auth_checked = True
                        
                        session_days = 30 if remember_me else 7
                        
                        if cookie_manager:
                            try:
                                token, _ = create_session_token(user_id, days=session_days)
                                expires = datetime.now() + timedelta(days=session_days)
                                cookie_manager.set("portfolio_session", token, expires_at=expires)
                                time.sleep(0.5)
                                st.rerun()
                            except Exception as ce:
                                logger.error(f"Session Token Error: {ce}")
                        
                        st.rerun()
                    else:
                        st.error("❌ Invalid email or password.")
                else:
                    st.error("❌ Invalid email or password.")
            except Exception as e:
                st.error(f"Login error: {e}")
            finally:
                conn.close()
        
        col1, col2 = st.columns([1, 1])
        with col2:
            if st.button("Forgot Password?", type="secondary", width="stretch"):
                st.session_state.auth_mode = "forgot_pass"
                st.rerun()
        
        st.markdown("---")
        if st.button("Create an Account", type="secondary", width="stretch"):
            st.session_state.auth_mode = "register"
            st.rerun()
    
    # Footer
    st.markdown("---")
    st.caption(get_db_info())


def restore_session_from_cookie(cookie_manager) -> bool:
    """Try to restore user session from cookie. Returns True if restored."""
    if not cookie_manager:
        return False
    
    try:
        all_cookies = cookie_manager.get_all()
        if all_cookies:
            session_token = all_cookies.get("portfolio_session")
            if session_token:
                user_info = get_user_from_token(session_token)
                if user_info:
                    st.session_state.logged_in = True
                    st.session_state.user_id = user_info["id"]
                    st.session_state.username = user_info["username"]
                    return True
                else:
                    # Invalid token - clean up
                    try:
                        cookie_manager.delete("portfolio_session")
                    except:
                        pass
    except Exception as e:
        logger.debug(f"Session restore error: {e}")
    
    return False


def get_cookie_manager():
    """Get the cookie manager instance."""
    try:
        import extra_streamlit_components as stx
        return stx.CookieManager(key="auth_cookies")
    except ImportError:
        logger.warning("extra_streamlit_components not available - cookies disabled")
        return None
    except Exception as e:
        logger.warning(f"Cookie manager error: {e}")
        return None
