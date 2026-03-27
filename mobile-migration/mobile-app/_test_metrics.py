import sys
sys.path.insert(0, r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\backend-api")

from app.api.v1.fundamental import _calculate_all_metrics

result = _calculate_all_metrics(1, '2024-12-31', 2024)
val = result.get('valuation', {})
if not val:
    result = _calculate_all_metrics(1, '2023-12-31', 2023)
    val = result.get('valuation', {})
    print('Using 2023 data:')

print('=== Valuation Metrics ===')
for k, v in val.items():
    print(f'  {k}: {v}')

prof = result.get('profitability', {})
print('\n=== Profitability ===')
print(f'  ROE: {prof.get("ROE")}')

cfm = result.get('cash_flow', {})
print('\n=== Cash Flow ===')
for k, v in list(cfm.items())[:5]:
    print(f'  {k}: {v}')

lev = result.get('leverage', {})
print('\n=== Leverage ===')
for k, v in list(lev.items())[:3]:
    print(f'  {k}: {v}')
