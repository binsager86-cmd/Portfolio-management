import sys
sys.path.insert(0, r"c:\Users\Sager\OneDrive\Desktop\portfolio_app\mobile-migration\backend-api")
from app.api.v1.fundamental import _calculate_all_metrics

for year in [2024, 2023, 2022, 2020]:
    result = _calculate_all_metrics(1, f'{year}-12-31', year)
    cfm = result.get('cashflow', {})
    fcf = cfm.get('Free Cash Flow')
    margin = cfm.get('FCF Margin')
    cfo = cfm.get('Cash from Operations')
    print(f'{year}: CFO={cfo}  FCF={fcf}  FCF Margin={margin}')
