import sqlite3

conn = sqlite3.connect('dev_portfolio.db')
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Token/session tables:", [t for t in tables if 'token' in t.lower() or 'black' in t.lower() or 'session' in t.lower()])

for row in conn.execute('SELECT id, username, failed_login_attempts, locked_until FROM users').fetchall():
    print(f'User {row[0]}: {row[1]}, failed_attempts={row[2]}, locked_until={row[3]}')

# Check if the token we issued is still valid by checking JWT secret
import sys
sys.path.insert(0, 'backend-api')
try:
    from app.core.config import get_settings
    s = get_settings()
    print(f"\nSECRET_KEY: {s.SECRET_KEY[:20]}...")
    print(f"ACCESS_TOKEN_EXPIRE: {s.ACCESS_TOKEN_EXPIRE_MINUTES} min")
except Exception as e:
    print(f"Config import error: {e}")
