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

# ─────────────────────────────────────────────────────────────────────
# Code Aliases — maps variant line-item codes to a canonical code.
# The AI extractor generates slightly different keys depending on how
# the original PDF labels items (e.g. "Net cash generated from
# operating activities" vs "Net cash from operating activities").
# This map ensures the same financial concept always uses ONE code
# so the multi-year display table shows values in the same row.
#
# Keys   → variant code (UPPER_SNAKE_CASE)
# Values → canonical code to normalize to
# ─────────────────────────────────────────────────────────────────────
LINE_ITEM_CODE_ALIASES: Dict[str, str] = {
    # ── Cash Flow — Operating Section Totals ──
    'NET_CASH_GENERATED_FROM_OPERATING_ACTIVITIES':
        'NET_CASH_FROM_OPERATING_ACTIVITIES',
    'OPERATING_PROFIT_BEFORE_WORKING_CAPITAL_CHANGES':
        'OPERATING_CASH_FLOWS_BEFORE_WORKING_CAPITAL_CHANGES',
    'SUBTOTAL_OPERATING_ACTIVITIES_1':
        'SUBTOTAL_OPERATING_CASH_FLOWS_AFTER_WORKING_CAPITAL_CHANGES',
    'SUBTOTAL_WORKING_CAPITAL_CHANGES':
        'SUBTOTAL_OPERATING_CASH_FLOWS_AFTER_WORKING_CAPITAL_CHANGES',

    # ── Cash Flow — Investing Section Totals ──
    'NET_CASH_USED_IN_INVESTING_ACTIVITIES':
        'NET_CASH_USED_IN_FROM_INVESTING_ACTIVITIES',

    # ── Cash Flow — Net Change in Cash ──
    'NET_INCREASE_IN_CASH_AND_CASH_EQUIVALENTS':
        'NET_DECREASE_INCREASE_IN_CASH_AND_CASH_EQUIVALENTS',

    # ── Cash Flow — Operating Working Capital Items ──
    'INCREASE_IN_TRADE_AND_OTHER_RECEIVABLES':
        'TRADE_AND_OTHER_RECEIVABLES',
    'DECREASE_INCREASE_IN_TRADE_AND_OTHER_PAYABLES':
        'TRADE_AND_OTHER_PAYABLES',
    'INCREASE_IN_ACCRUALS_AND_OTHER_LIABILITIES':
        'ACCRUED_EXPENSES_AND_OTHER_LIABILITIES',
    'ACCRUALS_AND_OTHER_LIABILITIES':
        'ACCRUED_EXPENSES_AND_OTHER_LIABILITIES',
    'DECREASE_INCREASE_IN_ACCRUALS_AND_OTHER_LIABILITIES':
        'ACCRUED_EXPENSES_AND_OTHER_LIABILITIES',
    'DECREASE_IN_INVENTORIES':
        'INVENTORIES',
    'DECREASE_IN_DEFERRED_INCOME':
        'DEFERRED_INCOME',
    'INCREASE_DECREASE_IN_DEFERRED_INCOME':
        'DEFERRED_INCOME',
    'INCREASE_IN_RETENTIONS_PAYABLE':
        'RETENTIONS_PAYABLE',

    # ── Cash Flow — Operating Adjustments ──
    'ALLOWANCE_FOR_DOUBTFUL_DEBTS':
        'EXPECTED_CREDIT_LOSS_ON_FINANCIAL_ASSETS',
    'NET_EXPECTED_CREDIT_LOSS_ON_FINANCIAL_ASSETS':
        'EXPECTED_CREDIT_LOSS_ON_FINANCIAL_ASSETS',
    'SHARE_OF_PROFIT_LOSS_OF_ASSOCIATES':
        'SHARE_OF_PROFIT_OF_ASSOCIATES',
    'SHARE_OF_LOSS_OF_ASSOCIATES':
        'SHARE_OF_PROFIT_OF_ASSOCIATES',
    'PROPERTY_AND_EQUIPMENT_AND_GOODWILL_WRITTEN_OFF':
        'PROPERTY_AND_EQUIPMENT_AND_INTANGIBLE_ASSETS_WRITTEN_OFF',

    # ── Cash Flow — Investing Items ──
    'INTEREST_INCOME_RECEIVED':
        'INTEREST_RECEIVED',
    'INVESTMENT_IN_MARGIN_DEPOSITS':
        'MARGIN_DEPOSITS_AND_RESTRICTED_DEPOSITS',
    'MARGIN_DEPOSITS':
        'MARGIN_DEPOSITS_AND_RESTRICTED_DEPOSITS',
    'MARGIN_DEPOSITS_AND_RESTRICTED_BALANCE':
        'MARGIN_DEPOSITS_AND_RESTRICTED_DEPOSITS',
    'INVESTMENT_IN_TERM_DEPOSITS':
        'TERM_DEPOSITS',

    # ── Cash Flow — Financing Items ──
    'DECREASE_INCREASE_IN_SHORT_TERM_LOAN':
        'SHORT_TERM_LOAN_MOVEMENT',
    'DECREASE_IN_SHORT_TERM_LOAN':
        'SHORT_TERM_LOAN_MOVEMENT',
    'INCREASE_IN_LONG_TERM_DEBTS':
        'PROCEEDS_FROM_BANK',
    'INCREASE_IN_TERM_DEBTS':
        'PROCEEDS_FROM_BANK',
    'REPAYMENT_OF_LEASE_LIABILITIES':
        'REPAYMENT_OF_PRINCIPAL_PORTION_OF_LEASE_LIABILITIES',
    'REPAYMENT_OF_LONG_TERM_DEBTS':
        'REPAYMENT_TO_BANK',

    # ── Balance Sheet Aliases ──
    'CURRENT_PORTION_OF_LONG_TERM_DEBT':
        'CURRENT_PORTION_OF_LONG_TERM_DEBTS',
    'INVESTMENT_IN_ASSOCIATE':
        'INVESTMENT_IN_ASSOCIATES',
    'GAIN_ON_SALE_OF_TREASURY_SHARES':
        'TREASURY_SHARES_RESERVE',
    'SHORT_TERM_LOAN':
        'SHORT_TERM_DEBT',
    'LONG_TERM_DEBTS':
        'LONG_TERM_DEBT',
    'INVESTMENT_AVAILABLE_FOR_SALE':
        'INVESTMENTS_AVAILABLE_FOR_SALE',
    'TOTAL_LIABILITIES_AND_EQUITY':
        'TOTAL_LIABILITIES_EQUITY',
    'CURRENT_ASSETS_TOTAL':
        'TOTAL_CURRENT_ASSETS',
    'CURRENT_ASSETS':
        'TOTAL_CURRENT_ASSETS',
    'NON_CURRENT_ASSETS_TOTAL':
        'TOTAL_NON_CURRENT_ASSETS',
    'NON_CURRENT_ASSETS':
        'TOTAL_NON_CURRENT_ASSETS',
    'CURRENT_LIABILITIES_TOTAL':
        'TOTAL_CURRENT_LIABILITIES',
    'CURRENT_LIABILITIES':
        'TOTAL_CURRENT_LIABILITIES',
    'NON_CURRENT_LIABILITIES_TOTAL':
        'TOTAL_NON_CURRENT_LIABILITIES',
    'NON_CURRENT_LIABILITIES':
        'TOTAL_NON_CURRENT_LIABILITIES',
    'EQUITY':
        'TOTAL_EQUITY',
    'ASSETS':
        'TOTAL_ASSETS',
    'LIABILITIES_AND_EQUITY':
        'TOTAL_LIABILITIES_EQUITY',

    # ── Income Statement Aliases ──
    'PROFIT_BEFORE_CONTRIBUTION_TO_KUWAIT_FOUNDATION_FOR_ADVANCEMENT_OF_SCIENCES_KFAS_NATIONAL_LABOUR_SUPPORT_TAX_NLST_ZAKAT_AND_DIRECTORS_REMUNERATION':
        'PROFIT_BEFORE_KFAS_NLST_ZAKAT_AND_DIRECTORS_REMUNERATION',
    'PROFIT_BEFORE_CONTRIBUTION_TO_KFAS_NLST_ZAKAT_AND_DIRECTORS_REMUNERATION':
        'PROFIT_BEFORE_KFAS_NLST_ZAKAT_AND_DIRECTORS_REMUNERATION',
}


def normalize_line_item_code(code: str) -> str:
    """Return the canonical code for *code*, or *code* unchanged if no alias."""
    return LINE_ITEM_CODE_ALIASES.get(code, code)


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
