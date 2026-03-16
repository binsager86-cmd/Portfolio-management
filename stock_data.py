# stock_data.py
# Centralized stock lists for Kuwait and US markets
# Only includes stocks verified to work on yfinance.
# Symbol must match the yfinance base ticker (before .KW suffix).

KUWAIT_STOCKS = [
    # ── BANKS ──
    {"symbol": "ABK", "name": "Al Ahli Bank of Kuwait", "yf_ticker": "ABK.KW"},
    {"symbol": "BOUBYAN", "name": "Boubyan Bank", "yf_ticker": "BOUBYAN.KW"},
    {"symbol": "BURG", "name": "Burgan Bank", "yf_ticker": "BURG.KW"},
    {"symbol": "CBK", "name": "Commercial Bank of Kuwait", "yf_ticker": "CBK.KW"},
    {"symbol": "GBK", "name": "Gulf Bank", "yf_ticker": "GBK.KW"},
    {"symbol": "KFH", "name": "Kuwait Finance House", "yf_ticker": "KFH.KW"},
    {"symbol": "KIB", "name": "Kuwait International Bank", "yf_ticker": "KIB.KW"},
    {"symbol": "NBK", "name": "National Bank of Kuwait", "yf_ticker": "NBK.KW"},

    # ── INVESTMENT COMPANIES ──
    {"symbol": "AAYAN", "name": "Aayan Leasing and Investment", "yf_ticker": "AAYAN.KW"},
    {"symbol": "ALIMTIAZ", "name": "Al Imtiaz Investment Group", "yf_ticker": "ALIMTIAZ.KW"},
    {"symbol": "ALSAFAT", "name": "Alsafat Investment Company", "yf_ticker": "ALSAFAT.KW"},
    {"symbol": "AMAR", "name": "Amar Finance and Leasing", "yf_ticker": "AMAR.KW"},
    {"symbol": "COAST", "name": "Coast Investment & Development", "yf_ticker": "COAST.KW"},
    {"symbol": "GFH", "name": "GFH Financial Group", "yf_ticker": "GFH.KW"},
    {"symbol": "INOVEST", "name": "Inovest", "yf_ticker": "INOVEST.KW"},
    {"symbol": "KAMCO", "name": "KAMCO Investment Company", "yf_ticker": "KAMCO.KW"},
    {"symbol": "KMEFIC", "name": "Kuwait and Middle East Financial Investment", "yf_ticker": "KMEFIC.KW"},
    {"symbol": "KPROJ", "name": "Kuwait Projects Company (KIPCO)", "yf_ticker": "KPROJ.KW"},
    {"symbol": "MARKAZ", "name": "Kuwait Financial Centre (Markaz)", "yf_ticker": "MARKAZ.KW"},
    {"symbol": "MASHAER", "name": "Mashaer Holding Company", "yf_ticker": "MASHAER.KW"},
    {"symbol": "NIH", "name": "National International Holding", "yf_ticker": "NIH.KW"},
    {"symbol": "NOOR", "name": "Noor Financial Investment", "yf_ticker": "NOOR.KW"},
    {"symbol": "SECH", "name": "The Securities House", "yf_ticker": "SECH.KW"},
    {"symbol": "TIJARA", "name": "Tijara & Real Estate Investment", "yf_ticker": "TIJARA.KW"},

    # ── REAL ESTATE ──
    {"symbol": "ALDEERA", "name": "Al Deera Holding", "yf_ticker": "ALDEERA.KW"},
    {"symbol": "AQAR", "name": "Aqar Real Estate Investments", "yf_ticker": "AQAR.KW"},
    {"symbol": "ARGAN", "name": "Alargan International Real Estate", "yf_ticker": "ARGAN.KW"},
    {"symbol": "ARKAN", "name": "Arkan Al-Kuwait Real Estate", "yf_ticker": "ARKAN.KW"},
    {"symbol": "IFA", "name": "IFA Hotels & Resorts", "yf_ticker": "IFA.KW"},
    {"symbol": "KRE", "name": "Kuwait Real Estate Company", "yf_ticker": "KRE.KW"},
    {"symbol": "MABANEE", "name": "Mabanee Company", "yf_ticker": "MABANEE.KW"},
    {"symbol": "MANAZEL", "name": "Manazel Holding Company", "yf_ticker": "MANAZEL.KW"},
    {"symbol": "MASAKEN", "name": "Masaken Real Estate Company", "yf_ticker": "MASAKEN.KW"},
    {"symbol": "MAZAYA", "name": "Mazaya Holding Company", "yf_ticker": "MAZAYA.KW"},
    {"symbol": "MUNSHAAT", "name": "Munshaat Real Estate Projects", "yf_ticker": "MUNSHAAT.KW"},
    {"symbol": "SANAM", "name": "Sanam Real Estate Company", "yf_ticker": "SANAM.KW"},
    {"symbol": "SOKOUK", "name": "Al-Soor Fuel Marketing Company", "yf_ticker": "SOKOUK.KW"},
    {"symbol": "URC", "name": "United Real Estate Company", "yf_ticker": "URC.KW"},

    # ── INDUSTRIAL ──
    {"symbol": "ACICO", "name": "ACICO Industries", "yf_ticker": "ACICO.KW"},
    {"symbol": "ASC", "name": "Automated Systems Company", "yf_ticker": "ASC.KW"},
    {"symbol": "BPCC", "name": "Boubyan Petrochemical Company", "yf_ticker": "BPCC.KW"},
    {"symbol": "EQUIPMENT", "name": "Al-Ahleia Contracting & Equipment", "yf_ticker": "EQUIPMENT.KW"},
    {"symbol": "KCEM", "name": "Kuwait Cement Company", "yf_ticker": "KCEM.KW"},
    {"symbol": "KGL", "name": "Kuwait & Gulf Link Transport", "yf_ticker": "KGL.KW"},
    {"symbol": "NIND", "name": "National Industries Group", "yf_ticker": "NIND.KW"},
    {"symbol": "UNICAP", "name": "United Fisheries of Kuwait", "yf_ticker": "UNICAP.KW"},

    # ── SERVICES & TECHNOLOGY ──
    {"symbol": "ALG", "name": "Alghanim Industries", "yf_ticker": "ALG.KW"},
    {"symbol": "BOURSA", "name": "Boursa Kuwait Securities", "yf_ticker": "BOURSA.KW"},
    {"symbol": "HUMANSOFT", "name": "Humansoft Holding", "yf_ticker": "HUMANSOFT.KW"},
    {"symbol": "OOREDOO", "name": "Ooredoo Kuwait (NMTC)", "yf_ticker": "OOREDOO.KW"},
    {"symbol": "STC", "name": "Kuwait Telecommunications Company (stc)", "yf_ticker": "STC.KW"},
    {"symbol": "WETHAQ", "name": "Wethaq Takaful Insurance", "yf_ticker": "WETHAQ.KW"},
    {"symbol": "ZAIN", "name": "Mobile Telecommunications Company (Zain)", "yf_ticker": "ZAIN.KW"},

    # ── INSURANCE ──
    {"symbol": "GINS", "name": "Gulf Insurance Group", "yf_ticker": "GINS.KW"},
    {"symbol": "KINS", "name": "Kuwait Insurance Company", "yf_ticker": "KINS.KW"},
    {"symbol": "KUWAITRE", "name": "Kuwait Reinsurance Company", "yf_ticker": "KUWAITRE.KW"},

    # ── FOOD & CONSUMER ──
    {"symbol": "KFIC", "name": "Kuwait Food Company (Americana)", "yf_ticker": "KFIC.KW"},
    {"symbol": "KPPC", "name": "Kuwait Portland Cement / Privatization Holding", "yf_ticker": "KPPC.KW"},
    {"symbol": "MEZZAN", "name": "Mezzan Holding", "yf_ticker": "MEZZAN.KW"},

    # ── OTHERS & HOLDING ──
    {"symbol": "ALEID", "name": "Al-Eid Holding Company", "yf_ticker": "ALEID.KW"},
    {"symbol": "ALMANAR", "name": "Al Manar Financing & Leasing", "yf_ticker": "ALMANAR.KW"},
    {"symbol": "INJAZZAT", "name": "Injazzat Real Estate Development", "yf_ticker": "INJAZZAT.KW"},
]

# US Market - Popular stocks (S&P 500, NASDAQ, etc.)
US_STOCKS = [
    # TECHNOLOGY (Big Tech)
    {"symbol": "AAPL", "name": "Apple Inc.", "yf_ticker": "AAPL"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "yf_ticker": "MSFT"},
    {"symbol": "GOOGL", "name": "Alphabet Inc. Class A", "yf_ticker": "GOOGL"},
    {"symbol": "GOOG", "name": "Alphabet Inc. Class C", "yf_ticker": "GOOG"},
    {"symbol": "AMZN", "name": "Amazon.com Inc.", "yf_ticker": "AMZN"},
    {"symbol": "META", "name": "Meta Platforms Inc.", "yf_ticker": "META"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "yf_ticker": "NVDA"},
    {"symbol": "TSLA", "name": "Tesla Inc.", "yf_ticker": "TSLA"},
    {"symbol": "AMD", "name": "Advanced Micro Devices Inc.", "yf_ticker": "AMD"},
    {"symbol": "INTC", "name": "Intel Corporation", "yf_ticker": "INTC"},
    {"symbol": "CRM", "name": "Salesforce Inc.", "yf_ticker": "CRM"},
    {"symbol": "ORCL", "name": "Oracle Corporation", "yf_ticker": "ORCL"},
    {"symbol": "CSCO", "name": "Cisco Systems Inc.", "yf_ticker": "CSCO"},
    {"symbol": "ADBE", "name": "Adobe Inc.", "yf_ticker": "ADBE"},
    {"symbol": "IBM", "name": "International Business Machines", "yf_ticker": "IBM"},
    {"symbol": "QCOM", "name": "QUALCOMM Incorporated", "yf_ticker": "QCOM"},
    {"symbol": "TXN", "name": "Texas Instruments Inc.", "yf_ticker": "TXN"},
    {"symbol": "AVGO", "name": "Broadcom Inc.", "yf_ticker": "AVGO"},
    {"symbol": "NOW", "name": "ServiceNow Inc.", "yf_ticker": "NOW"},
    {"symbol": "SHOP", "name": "Shopify Inc.", "yf_ticker": "SHOP"},
    {"symbol": "SQ", "name": "Block Inc.", "yf_ticker": "SQ"},
    {"symbol": "PYPL", "name": "PayPal Holdings Inc.", "yf_ticker": "PYPL"},
    {"symbol": "UBER", "name": "Uber Technologies Inc.", "yf_ticker": "UBER"},
    {"symbol": "ABNB", "name": "Airbnb Inc.", "yf_ticker": "ABNB"},
    {"symbol": "SNOW", "name": "Snowflake Inc.", "yf_ticker": "SNOW"},
    {"symbol": "PLTR", "name": "Palantir Technologies Inc.", "yf_ticker": "PLTR"},
    {"symbol": "NET", "name": "Cloudflare Inc.", "yf_ticker": "NET"},
    {"symbol": "CRWD", "name": "CrowdStrike Holdings Inc.", "yf_ticker": "CRWD"},
    {"symbol": "ZS", "name": "Zscaler Inc.", "yf_ticker": "ZS"},
    {"symbol": "DDOG", "name": "Datadog Inc.", "yf_ticker": "DDOG"},
    
    # FINANCIALS
    {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "yf_ticker": "JPM"},
    {"symbol": "BAC", "name": "Bank of America Corporation", "yf_ticker": "BAC"},
    {"symbol": "WFC", "name": "Wells Fargo & Company", "yf_ticker": "WFC"},
    {"symbol": "GS", "name": "Goldman Sachs Group Inc.", "yf_ticker": "GS"},
    {"symbol": "MS", "name": "Morgan Stanley", "yf_ticker": "MS"},
    {"symbol": "C", "name": "Citigroup Inc.", "yf_ticker": "C"},
    {"symbol": "USB", "name": "U.S. Bancorp", "yf_ticker": "USB"},
    {"symbol": "AXP", "name": "American Express Company", "yf_ticker": "AXP"},
    {"symbol": "V", "name": "Visa Inc.", "yf_ticker": "V"},
    {"symbol": "MA", "name": "Mastercard Incorporated", "yf_ticker": "MA"},
    {"symbol": "BRK-B", "name": "Berkshire Hathaway Inc. Class B", "yf_ticker": "BRK-B"},
    {"symbol": "BLK", "name": "BlackRock Inc.", "yf_ticker": "BLK"},
    {"symbol": "SCHW", "name": "Charles Schwab Corporation", "yf_ticker": "SCHW"},
    {"symbol": "COF", "name": "Capital One Financial Corp.", "yf_ticker": "COF"},
    
    # HEALTHCARE
    {"symbol": "JNJ", "name": "Johnson & Johnson", "yf_ticker": "JNJ"},
    {"symbol": "UNH", "name": "UnitedHealth Group Inc.", "yf_ticker": "UNH"},
    {"symbol": "PFE", "name": "Pfizer Inc.", "yf_ticker": "PFE"},
    {"symbol": "ABBV", "name": "AbbVie Inc.", "yf_ticker": "ABBV"},
    {"symbol": "MRK", "name": "Merck & Co. Inc.", "yf_ticker": "MRK"},
    {"symbol": "LLY", "name": "Eli Lilly and Company", "yf_ticker": "LLY"},
    {"symbol": "TMO", "name": "Thermo Fisher Scientific Inc.", "yf_ticker": "TMO"},
    {"symbol": "ABT", "name": "Abbott Laboratories", "yf_ticker": "ABT"},
    {"symbol": "BMY", "name": "Bristol-Myers Squibb Company", "yf_ticker": "BMY"},
    {"symbol": "AMGN", "name": "Amgen Inc.", "yf_ticker": "AMGN"},
    {"symbol": "GILD", "name": "Gilead Sciences Inc.", "yf_ticker": "GILD"},
    {"symbol": "MRNA", "name": "Moderna Inc.", "yf_ticker": "MRNA"},
    {"symbol": "CVS", "name": "CVS Health Corporation", "yf_ticker": "CVS"},
    
    # CONSUMER DISCRETIONARY
    {"symbol": "HD", "name": "The Home Depot Inc.", "yf_ticker": "HD"},
    {"symbol": "MCD", "name": "McDonald's Corporation", "yf_ticker": "MCD"},
    {"symbol": "NKE", "name": "Nike Inc.", "yf_ticker": "NKE"},
    {"symbol": "SBUX", "name": "Starbucks Corporation", "yf_ticker": "SBUX"},
    {"symbol": "LOW", "name": "Lowe's Companies Inc.", "yf_ticker": "LOW"},
    {"symbol": "TGT", "name": "Target Corporation", "yf_ticker": "TGT"},
    {"symbol": "COST", "name": "Costco Wholesale Corporation", "yf_ticker": "COST"},
    {"symbol": "WMT", "name": "Walmart Inc.", "yf_ticker": "WMT"},
    {"symbol": "DIS", "name": "The Walt Disney Company", "yf_ticker": "DIS"},
    {"symbol": "NFLX", "name": "Netflix Inc.", "yf_ticker": "NFLX"},
    {"symbol": "BKNG", "name": "Booking Holdings Inc.", "yf_ticker": "BKNG"},
    {"symbol": "CMG", "name": "Chipotle Mexican Grill Inc.", "yf_ticker": "CMG"},
    
    # CONSUMER STAPLES
    {"symbol": "PG", "name": "Procter & Gamble Company", "yf_ticker": "PG"},
    {"symbol": "KO", "name": "The Coca-Cola Company", "yf_ticker": "KO"},
    {"symbol": "PEP", "name": "PepsiCo Inc.", "yf_ticker": "PEP"},
    {"symbol": "PM", "name": "Philip Morris International", "yf_ticker": "PM"},
    {"symbol": "MO", "name": "Altria Group Inc.", "yf_ticker": "MO"},
    {"symbol": "MDLZ", "name": "Mondelez International Inc.", "yf_ticker": "MDLZ"},
    {"symbol": "CL", "name": "Colgate-Palmolive Company", "yf_ticker": "CL"},
    
    # INDUSTRIALS
    {"symbol": "BA", "name": "The Boeing Company", "yf_ticker": "BA"},
    {"symbol": "CAT", "name": "Caterpillar Inc.", "yf_ticker": "CAT"},
    {"symbol": "GE", "name": "General Electric Company", "yf_ticker": "GE"},
    {"symbol": "HON", "name": "Honeywell International Inc.", "yf_ticker": "HON"},
    {"symbol": "UPS", "name": "United Parcel Service Inc.", "yf_ticker": "UPS"},
    {"symbol": "FDX", "name": "FedEx Corporation", "yf_ticker": "FDX"},
    {"symbol": "LMT", "name": "Lockheed Martin Corporation", "yf_ticker": "LMT"},
    {"symbol": "RTX", "name": "RTX Corporation", "yf_ticker": "RTX"},
    {"symbol": "DE", "name": "Deere & Company", "yf_ticker": "DE"},
    {"symbol": "MMM", "name": "3M Company", "yf_ticker": "MMM"},
    
    # ENERGY
    {"symbol": "XOM", "name": "Exxon Mobil Corporation", "yf_ticker": "XOM"},
    {"symbol": "CVX", "name": "Chevron Corporation", "yf_ticker": "CVX"},
    {"symbol": "COP", "name": "ConocoPhillips", "yf_ticker": "COP"},
    {"symbol": "SLB", "name": "Schlumberger Limited", "yf_ticker": "SLB"},
    {"symbol": "EOG", "name": "EOG Resources Inc.", "yf_ticker": "EOG"},
    {"symbol": "OXY", "name": "Occidental Petroleum Corporation", "yf_ticker": "OXY"},
    
    # COMMUNICATION SERVICES
    {"symbol": "T", "name": "AT&T Inc.", "yf_ticker": "T"},
    {"symbol": "VZ", "name": "Verizon Communications Inc.", "yf_ticker": "VZ"},
    {"symbol": "TMUS", "name": "T-Mobile US Inc.", "yf_ticker": "TMUS"},
    {"symbol": "CMCSA", "name": "Comcast Corporation", "yf_ticker": "CMCSA"},
    
    # UTILITIES & REAL ESTATE
    {"symbol": "NEE", "name": "NextEra Energy Inc.", "yf_ticker": "NEE"},
    {"symbol": "DUK", "name": "Duke Energy Corporation", "yf_ticker": "DUK"},
    {"symbol": "SO", "name": "Southern Company", "yf_ticker": "SO"},
    {"symbol": "AMT", "name": "American Tower Corporation", "yf_ticker": "AMT"},
    {"symbol": "PLD", "name": "Prologis Inc.", "yf_ticker": "PLD"},
    {"symbol": "SPG", "name": "Simon Property Group Inc.", "yf_ticker": "SPG"},
    
    # ETFs (Popular Index Funds)
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "yf_ticker": "SPY"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust (NASDAQ-100)", "yf_ticker": "QQQ"},
    {"symbol": "IWM", "name": "iShares Russell 2000 ETF", "yf_ticker": "IWM"},
    {"symbol": "DIA", "name": "SPDR Dow Jones Industrial Average ETF", "yf_ticker": "DIA"},
    {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF", "yf_ticker": "VTI"},
    {"symbol": "VOO", "name": "Vanguard S&P 500 ETF", "yf_ticker": "VOO"},
    {"symbol": "VGT", "name": "Vanguard Information Technology ETF", "yf_ticker": "VGT"},
    {"symbol": "ARKK", "name": "ARK Innovation ETF", "yf_ticker": "ARKK"},
    {"symbol": "XLF", "name": "Financial Select Sector SPDR Fund", "yf_ticker": "XLF"},
    {"symbol": "XLK", "name": "Technology Select Sector SPDR Fund", "yf_ticker": "XLK"},
    {"symbol": "KRE", "name": "SPDR S&P Regional Banking ETF", "yf_ticker": "KRE"},
    {"symbol": "XLE", "name": "Energy Select Sector SPDR Fund", "yf_ticker": "XLE"},
    {"symbol": "XLV", "name": "Health Care Select Sector SPDR Fund", "yf_ticker": "XLV"},
    
    # BIOTECH / PHARMA (not in major indices)
    {"symbol": "INCY", "name": "Incyte Corporation", "yf_ticker": "INCY"},
    {"symbol": "BIIB", "name": "Biogen Inc.", "yf_ticker": "BIIB"},
    {"symbol": "REGN", "name": "Regeneron Pharmaceuticals Inc.", "yf_ticker": "REGN"},
    {"symbol": "VRTX", "name": "Vertex Pharmaceuticals Inc.", "yf_ticker": "VRTX"},
]


# =========================
# HELPER FUNCTIONS
# =========================

def normalize_kwd_price(price: float, currency: str) -> float:
    """
    Auto-corrects Kuwait prices that are reported in Fils (e.g. 2600 -> 2.6).
    Yahoo Finance sometimes returns Kuwait stock prices in Fils instead of KWD.
    This function normalizes them to KWD.
    
    Args:
        price: The raw price value
        currency: The currency code (e.g., 'KWD', 'USD')
    
    Returns:
        Normalized price in proper units (rounded to 3 decimals for KWD)
    """
    if price is None:
        return 0.0
    if currency == 'KWD' and price > 50:
        # Round to 3 decimals to prevent floating point precision errors
        return round(price / 1000.0, 3)
    return price


def get_kuwait_stock_options():
    """Return formatted list of Kuwait stocks for selectbox."""
    options = ["-- Select from Kuwait Stock List --"] + [
        f"{stock['symbol']} - {stock['name']}" for stock in KUWAIT_STOCKS
    ]
    return options


def get_us_stock_options():
    """Return formatted list of US stocks for selectbox."""
    options = ["-- Select from US Stock List --"] + [
        f"{stock['symbol']} - {stock['name']}" for stock in US_STOCKS
    ]
    return options


def parse_stock_selection(selection: str, market: str = "Kuwait"):
    """Parse selected stock to extract symbol, name, and Yahoo Finance ticker."""
    placeholder = "-- Select from Kuwait Stock List --" if market == "Kuwait" else "-- Select from US Stock List --"
    if selection == placeholder or not selection:
        return None, None, None
    
    parts = selection.split(" - ", 1)
    if len(parts) == 2:
        symbol = parts[0].strip()
        name = parts[1].strip()
        stock_list = KUWAIT_STOCKS if market == "Kuwait" else US_STOCKS
        for stock in stock_list:
            if stock["symbol"] == symbol:
                return symbol, name, stock["yf_ticker"]
    return None, None, None


def parse_kuwait_stock_selection(selection: str):
    """Parse selected stock to extract symbol, name, and Yahoo Finance ticker."""
    if selection == "-- Select from Kuwait Stock List --" or not selection:
        return None, None, None
    
    parts = selection.split(" - ", 1)
    if len(parts) == 2:
        symbol = parts[0].strip()
        name = parts[1].strip()
        # Find the stock in KUWAIT_STOCKS to get yf_ticker
        for stock in KUWAIT_STOCKS:
            if stock["symbol"] == symbol:
                return symbol, name, stock["yf_ticker"]
    return None, None, None
