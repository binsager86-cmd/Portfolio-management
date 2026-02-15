"""
Stock Analysis Module — Configuration & Constants
Separate from the main portfolio app configuration.
"""

import os
from typing import Dict, List

# ─────────────────────────────────────────────
# Gemini API Configuration
# ─────────────────────────────────────────────
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_MODEL = 'models/gemini-2.5-flash'  # default model; fast & free tier

# Fallback model order — if the primary model hits rate limits or
# returns 404, try the next model in this list.
# ✅ UPDATED FEB 2026
MODEL_FALLBACK_ORDER = [
    'models/gemini-2.5-flash',     # Primary — free tier compatible
    'models/gemini-2.5-pro',       # Fallback — complex documents
]

# Rate limit configuration
RATE_LIMIT_DELAY = 30   # seconds to wait after 429
MAX_RETRIES = 3         # retries per model before fallback

# Extraction cache directory (relative to repo root)
CACHE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'data', 'extraction_cache',
)

# ─────────────────────────────────────────────
# Database Configuration
# ─────────────────────────────────────────────
ANALYSIS_DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'stock_analysis.db'
)

# ─────────────────────────────────────────────
# Standardized Financial Line-Item Codes
# Keys are machine-readable codes; values are display labels.
# ─────────────────────────────────────────────
FINANCIAL_LINE_ITEM_CODES: Dict[str, str] = {
    # ── Income Statement ──
    'REVENUE':              'Total Revenue',
    'COST_OF_REVENUE':      'Cost of Revenue',
    'GROSS_PROFIT':         'Gross Profit',
    'R&D':                  'Research & Development',
    'SGA':                  'Selling General & Administrative',
    'OPERATING_EXPENSES':   'Operating Expenses',
    'OPERATING_INCOME':     'Operating Income',
    'INTEREST_EXPENSE':     'Interest Expense',
    'INTEREST_INCOME':      'Interest Income',
    'OTHER_INCOME':         'Other Income/Expense',
    'INCOME_BEFORE_TAX':    'Income Before Tax',
    'INCOME_TAX':           'Income Tax Expense',
    'NET_INCOME':           'Net Income',
    'EPS_BASIC':            'EPS (Basic)',
    'EPS_DILUTED':          'EPS (Diluted)',
    'SHARES_BASIC':         'Shares Outstanding (Basic)',
    'SHARES_DILUTED':       'Shares Outstanding (Diluted)',

    # ── Balance Sheet — Assets ──
    'CASH_EQUIVALENTS':         'Cash & Cash Equivalents',
    'SHORT_TERM_INVESTMENTS':   'Short Term Investments',
    'ACCOUNTS_RECEIVABLE':      'Accounts Receivable',
    'INVENTORY':                'Inventory',
    'OTHER_CURRENT_ASSETS':     'Other Current Assets',
    'TOTAL_CURRENT_ASSETS':     'Total Current Assets',
    'PPE_NET':                  'Property Plant & Equipment (Net)',
    'GOODWILL':                 'Goodwill',
    'INTANGIBLE_ASSETS':        'Intangible Assets',
    'LONG_TERM_INVESTMENTS':    'Long Term Investments',
    'OTHER_NON_CURRENT_ASSETS': 'Other Non-Current Assets',
    'TOTAL_NON_CURRENT_ASSETS': 'Total Non-Current Assets',
    'TOTAL_ASSETS':             'Total Assets',

    # ── Balance Sheet — Liabilities & Equity ──
    'ACCOUNTS_PAYABLE':             'Accounts Payable',
    'SHORT_TERM_DEBT':              'Short Term Debt',
    'OTHER_CURRENT_LIABILITIES':    'Other Current Liabilities',
    'TOTAL_CURRENT_LIABILITIES':    'Total Current Liabilities',
    'LONG_TERM_DEBT':               'Long Term Debt',
    'OTHER_NON_CURRENT_LIABILITIES':'Other Non-Current Liabilities',
    'TOTAL_NON_CURRENT_LIABILITIES':'Total Non-Current Liabilities',
    'TOTAL_LIABILITIES':            'Total Liabilities',
    'COMMON_STOCK':                 'Common Stock',
    'RETAINED_EARNINGS':            'Retained Earnings',
    'TREASURY_STOCK':               'Treasury Stock',
    'OTHER_EQUITY':                 'Other Equity',
    'TOTAL_EQUITY':                 'Total Equity',
    'TOTAL_LIABILITIES_EQUITY':     'Total Liabilities & Equity',

    # ── Cash Flow Statement ──
    'NET_INCOME_CF':            'Net Income (CF)',
    'DEPRECIATION_AMORTIZATION':'Depreciation & Amortization',
    'CHANGES_WORKING_CAPITAL':  'Changes in Working Capital',
    'CASH_FROM_OPERATIONS':     'Cash from Operating Activities',
    'CAPITAL_EXPENDITURES':     'Capital Expenditures',
    'ACQUISITIONS':             'Acquisitions',
    'OTHER_INVESTING':          'Other Investing Activities',
    'CASH_FROM_INVESTING':      'Cash from Investing Activities',
    'DEBT_ISSUED':              'Debt Issued',
    'DEBT_REPAID':              'Debt Repaid',
    'SHARES_ISSUED':            'Shares Issued',
    'SHARES_REPURCHASED':       'Shares Repurchased',
    'DIVIDENDS_PAID':           'Dividends Paid',
    'CASH_FROM_FINANCING':      'Cash from Financing Activities',
    'NET_CHANGE_CASH':          'Net Change in Cash',
    'BEGINNING_CASH':           'Beginning Cash',
    'ENDING_CASH':              'Ending Cash',

    # ── Additional / Derived ──
    'EBITDA':       'EBITDA',
    'FCF':          'Free Cash Flow',
    'CAPEX':        'Capital Expenditures',
    'DIVIDENDS':    'Dividends',
    'SHARE_COUNT':  'Shares Outstanding',
}

# ─────────────────────────────────────────────
# Statement Types
# ─────────────────────────────────────────────
STATEMENT_TYPES: Dict[str, str] = {
    'income':   'Income Statement',
    'balance':  'Balance Sheet',
    'cashflow': 'Cash Flow Statement',
}

# ─────────────────────────────────────────────
# Metric Type Categories (CFA Framework)
# ─────────────────────────────────────────────
METRIC_CATEGORIES: Dict[str, str] = {
    'profitability': 'Profitability Ratios',
    'liquidity':     'Liquidity Ratios',
    'leverage':      'Leverage / Solvency Ratios',
    'efficiency':    'Efficiency / Activity Ratios',
    'valuation':     'Valuation Ratios',
    'growth':        'Growth Metrics',
    'cashflow':      'Cash Flow Metrics',
}

# ─────────────────────────────────────────────
# Valuation Model Types
# ─────────────────────────────────────────────
VALUATION_MODEL_TYPES: Dict[str, str] = {
    'graham':    'Graham Number',
    'dcf':       'Discounted Cash Flow (DCF)',
    'ddm':       'Dividend Discount Model (DDM)',
    'multiples': 'Comparable Multiples',
}

# ─────────────────────────────────────────────
# Validation Thresholds
# ─────────────────────────────────────────────
VALIDATION_CONFIG = {
    'min_confidence_threshold': 0.70,
    'balance_sheet_tolerance':  0.01,   # 1 % tolerance for A = L + E
    'max_reasonable_growth_rate': 0.50, # 50 % max YoY growth
}

# ─────────────────────────────────────────────
# Exchange Choices (for UI dropdowns)
# ─────────────────────────────────────────────
EXCHANGE_CHOICES: List[str] = [
    'NYSE', 'NASDAQ', 'LSE', 'TSE', 'KSE',
    'BHB', 'ADX', 'DFM', 'TADAWUL', 'OTHER',
]

# ─────────────────────────────────────────────
# Sector / Industry (GICS Level 1)
# ─────────────────────────────────────────────
SECTOR_CHOICES: List[str] = [
    'Communication Services',
    'Consumer Discretionary',
    'Consumer Staples',
    'Energy',
    'Financials',
    'Health Care',
    'Industrials',
    'Information Technology',
    'Materials',
    'Real Estate',
    'Utilities',
]

# ─────────────────────────────────────────────
# Country Choices
# ─────────────────────────────────────────────
COUNTRY_CHOICES: List[str] = [
    'United States', 'United Kingdom', 'Kuwait', 'Saudi Arabia',
    'UAE', 'Bahrain', 'Japan', 'Germany', 'France', 'Other',
]

# ─────────────────────────────────────────────
# Currency Choices
# ─────────────────────────────────────────────
CURRENCY_CHOICES: List[str] = [
    'USD', 'KWD', 'EUR', 'GBP', 'JPY', 'SAR', 'AED', 'BHD',
]
