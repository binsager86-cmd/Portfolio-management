import sys
print(f'Python: {sys.version[:6]}')
try:
    import yfinance as yf
    print('yfinance: ✓ OK')
    print(f'yf version: {yf.__version__}')
except Exception as e:
    print(f'yfinance: ✗ {e}')
