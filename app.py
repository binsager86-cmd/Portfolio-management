# app.py
"""
Portfolio App - Router Entry Point

This is the main entry point that:
1. Loads MINIMAL imports for fast startup
2. Shows login page (lightweight) for unauthenticated users
3. Loads full app (heavy imports) ONLY after authentication

Run with: streamlit run app.py
"""

import streamlit as st
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

# ====== PAGE CONFIG (Must be first Streamlit command) ======
st.set_page_config(
    page_title="Portfolio Management",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

def main():
    """Main router - loads minimal auth or full app based on login state."""
    
    # =============================
    # STEP 1: Check if already logged in (session state)
    # =============================
    if st.session_state.get('logged_in') and st.session_state.get('user_id'):
        # User is logged in - load full app
        from ui import main as ui_main
        ui_main()
        return
    
    # =============================
    # STEP 2: Try to restore session from cookie (lightweight check)
    # =============================
    from auth_app import get_cookie_manager, restore_session_from_cookie, login_page
    
    cookie_manager = get_cookie_manager()
    
    # Only check cookies once per session
    if not st.session_state.get('_auth_checked'):
        if cookie_manager:
            # Wait for cookies to load
            try:
                all_cookies = cookie_manager.get_all()
                cookies_loaded = all_cookies is not None
            except:
                cookies_loaded = False
            
            if cookies_loaded:
                restored = restore_session_from_cookie(cookie_manager)
                st.session_state._auth_checked = True
                
                if restored:
                    # Session restored - load full app
                    st.rerun()
            else:
                # Cookies not loaded yet - rerun to wait
                st.session_state._auth_checked = True
                st.rerun()
        else:
            st.session_state._auth_checked = True
    
    # =============================
    # STEP 3: Show login page (lightweight - no heavy imports)
    # =============================
    if not st.session_state.get('logged_in'):
        login_page(cookie_manager)
        return
    
    # =============================
    # STEP 4: User just logged in - load full app
    # =============================
    from ui import main as ui_main
    ui_main()


if __name__ == "__main__":
    main()

