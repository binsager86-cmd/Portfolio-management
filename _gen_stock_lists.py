"""
Generate stock_lists.py for backend from root stock_data.py.
Run: python _gen_stock_lists.py
"""
import stock_data

kw = stock_data.KUWAIT_STOCKS
us = stock_data.US_STOCKS

lines = []
lines.append('"""')
lines.append('Hardcoded stock reference lists for Kuwait and US markets.')
lines.append('Mirrors stock_data.py from the root project.')
lines.append('"""')
lines.append('')
lines.append('from typing import List, Dict')
lines.append('')
lines.append('')

lines.append('KUWAIT_STOCKS: List[Dict[str, str]] = [')
for s in kw:
    sym = s["symbol"]
    name = s["name"].replace('"', '\\"')
    yf = s["yf_ticker"]
    lines.append(f'    {{"symbol": "{sym}", "name": "{name}", "yf_ticker": "{yf}"}},')
lines.append(']')
lines.append('')
lines.append('')

lines.append('US_STOCKS: List[Dict[str, str]] = [')
for s in us:
    sym = s["symbol"]
    name = s["name"].replace('"', '\\"')
    yf = s["yf_ticker"]
    lines.append(f'    {{"symbol": "{sym}", "name": "{name}", "yf_ticker": "{yf}"}},')
lines.append(']')
lines.append('')

output = '\n'.join(lines)
target = r'c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\backend-api\app\data\stock_lists.py'
with open(target, 'w', encoding='utf-8') as f:
    f.write(output)
print(f'Wrote {len(output)} bytes ({len(kw)} KW + {len(us)} US stocks)')
