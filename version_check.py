import sys
import streamlit as st

st.title("🔍 Python Version Check")
st.write(f"**Python Version:** {sys.version}")
st.write(f"**Python Executable:** {sys.executable}")

try:
    import yfinance as yf
    st.success(f"✓ yfinance v{yf.__version__} available")
except Exception as e:
    st.error(f"✗ yfinance error: {e}")
