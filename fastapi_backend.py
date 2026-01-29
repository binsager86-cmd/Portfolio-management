"""
FastAPI Backend for Financial Planner
Run with: uvicorn fastapi_backend:app --reload --port 8000
Access API docs at: http://localhost:8000/docs
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

app = FastAPI(
    title="Financial Planner API",
    description="Time Value of Money calculations API for React/Vue/Angular frontends",
    version="1.0.0"
)

# CORS middleware - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your React app's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# PYDANTIC MODELS
# ============================================

class FutureValueRequest(BaseModel):
    present_value: float = Field(..., ge=0, description="Starting amount")
    years: int = Field(..., ge=1, le=100, description="Investment period in years")
    frequency: str = Field(..., description="Contribution frequency: Annually, Semiannually, Quarterly, Monthly, Weekly")
    annual_yield: float = Field(..., ge=0, le=100, description="Expected annual yield percentage")
    contribution: float = Field(..., ge=0, description="Periodic contribution amount")

class RequiredYieldRequest(BaseModel):
    present_value: float = Field(..., ge=0, description="Starting amount")
    years: int = Field(..., ge=1, le=100, description="Investment period in years")
    frequency: str = Field(..., description="Contribution frequency")
    target_fv: float = Field(..., ge=0, description="Target future value")
    contribution: float = Field(..., ge=0, description="Periodic contribution amount")

class RequiredContributionRequest(BaseModel):
    present_value: float = Field(..., ge=0, description="Starting amount")
    years: int = Field(..., ge=1, le=100, description="Investment period in years")
    frequency: str = Field(..., description="Contribution frequency")
    annual_yield: float = Field(..., ge=0, le=100, description="Expected annual yield percentage")
    target_fv: float = Field(..., ge=0, description="Target future value")

class CalculationResult(BaseModel):
    result: float
    result_formatted: str
    result_label: str
    starting_value: float
    total_contributions: float
    total_interest: float
    total_periods: int
    frequency_label: str
    calculation_date: str

class ProjectionRow(BaseModel):
    period: int
    year: float
    payment_added: float
    principal: float
    interest_earned: float
    cumulative_interest: float
    total_balance: float

class ProjectionResponse(BaseModel):
    calculation: CalculationResult
    projection: List[ProjectionRow]

# ============================================
# CALCULATION FUNCTIONS
# ============================================

FREQ_MAP = {
    "Annually": 1,
    "Semiannually": 2,
    "Quarterly": 4,
    "Monthly": 12,
    "Weekly": 52
}

def get_frequency(freq_str: str) -> int:
    if freq_str not in FREQ_MAP:
        raise HTTPException(status_code=400, detail=f"Invalid frequency. Must be one of: {list(FREQ_MAP.keys())}")
    return FREQ_MAP[freq_str]


def calculate_future_value(pv: float, years: int, freq: int, rate: float, pmt: float) -> tuple:
    """Calculate Future Portfolio Value"""
    total_periods = years * freq
    periodic_rate = (rate / 100) / freq
    
    if periodic_rate > 0:
        fv_pv = pv * ((1 + periodic_rate) ** total_periods)
        fv_pmt = pmt * (((1 + periodic_rate) ** total_periods - 1) / periodic_rate)
        result = fv_pv + fv_pmt
    else:
        result = pv + (pmt * total_periods)
    
    total_contrib = pv + (pmt * total_periods)
    total_interest = result - total_contrib
    
    return result, pv, pmt * total_periods, total_interest, total_periods


def calculate_required_yield(pv: float, years: int, freq: int, target_fv: float, pmt: float) -> tuple:
    """Calculate Required Yield % using binary search"""
    total_periods = years * freq
    total_contrib = pv + (pmt * total_periods)
    
    if target_fv <= total_contrib:
        return 0.0, pv, pmt * total_periods, 0.0, total_periods
    
    low_rate, high_rate = 0.0001, 1.0
    
    for _ in range(100):
        mid_rate = (low_rate + high_rate) / 2
        periodic_rate = mid_rate / freq
        
        if periodic_rate > 0:
            fv_pv = pv * ((1 + periodic_rate) ** total_periods)
            fv_pmt = pmt * (((1 + periodic_rate) ** total_periods - 1) / periodic_rate)
            calc_fv = fv_pv + fv_pmt
        else:
            calc_fv = pv + (pmt * total_periods)
        
        if abs(calc_fv - target_fv) < 0.01:
            break
        elif calc_fv < target_fv:
            low_rate = mid_rate
        else:
            high_rate = mid_rate
    
    result_rate = mid_rate * 100
    total_interest = target_fv - total_contrib
    
    return result_rate, pv, pmt * total_periods, total_interest, total_periods


def calculate_required_contribution(pv: float, years: int, freq: int, rate: float, target_fv: float) -> tuple:
    """Calculate Required Periodic Contribution"""
    total_periods = years * freq
    periodic_rate = (rate / 100) / freq
    
    if periodic_rate > 0:
        fv_from_pv = pv * ((1 + periodic_rate) ** total_periods)
        remaining_fv = target_fv - fv_from_pv
        annuity_factor = ((1 + periodic_rate) ** total_periods - 1) / periodic_rate
        required_pmt = remaining_fv / annuity_factor if annuity_factor > 0 else 0
    else:
        required_pmt = (target_fv - pv) / total_periods if total_periods > 0 else 0
    
    required_pmt = max(0, required_pmt)
    total_contrib = pv + (required_pmt * total_periods)
    total_interest = target_fv - total_contrib
    
    return required_pmt, pv, required_pmt * total_periods, total_interest, total_periods


def generate_projection(pv: float, years: int, freq: int, rate: float, pmt: float) -> List[ProjectionRow]:
    """Generate projection schedule"""
    total_periods = years * freq
    periodic_rate = (rate / 100) / freq
    
    projection = []
    balance = pv
    total_principal = pv
    cumulative_interest = 0
    
    # Initial row
    projection.append(ProjectionRow(
        period=0,
        year=0,
        payment_added=0,
        principal=pv,
        interest_earned=0,
        cumulative_interest=0,
        total_balance=pv
    ))
    
    for period in range(1, total_periods + 1):
        balance += pmt
        total_principal += pmt
        
        interest_this_period = balance * periodic_rate
        balance += interest_this_period
        cumulative_interest += interest_this_period
        
        year = period / freq
        
        projection.append(ProjectionRow(
            period=period,
            year=round(year, 2),
            payment_added=pmt,
            principal=total_principal,
            interest_earned=interest_this_period,
            cumulative_interest=cumulative_interest,
            total_balance=balance
        ))
    
    return projection


# ============================================
# API ENDPOINTS
# ============================================

@app.get("/")
async def root():
    """API health check"""
    return {
        "status": "online",
        "api": "Financial Planner API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": [
            "/calculate/future-value",
            "/calculate/required-yield",
            "/calculate/required-contribution"
        ]
    }


@app.post("/calculate/future-value", response_model=ProjectionResponse)
async def api_future_value(request: FutureValueRequest):
    """
    Calculate Future Portfolio Value (Solve for FV)
    
    Returns the future value based on present value, periodic contributions,
    expected yield, and investment period.
    """
    freq = get_frequency(request.frequency)
    result, start, contrib, interest, periods = calculate_future_value(
        request.present_value,
        request.years,
        freq,
        request.annual_yield,
        request.contribution
    )
    
    projection = generate_projection(
        request.present_value,
        request.years,
        freq,
        request.annual_yield,
        request.contribution
    )
    
    return ProjectionResponse(
        calculation=CalculationResult(
            result=result,
            result_formatted=f"${result:,.2f}",
            result_label="Future Portfolio Value",
            starting_value=start,
            total_contributions=contrib,
            total_interest=interest,
            total_periods=periods,
            frequency_label=request.frequency,
            calculation_date=datetime.now().isoformat()
        ),
        projection=projection
    )


@app.post("/calculate/required-yield", response_model=CalculationResult)
async def api_required_yield(request: RequiredYieldRequest):
    """
    Calculate Required Annual Yield (Solve for Rate)
    
    Returns the annual yield percentage needed to reach your target
    given your starting amount, contributions, and time period.
    """
    freq = get_frequency(request.frequency)
    result, start, contrib, interest, periods = calculate_required_yield(
        request.present_value,
        request.years,
        freq,
        request.target_fv,
        request.contribution
    )
    
    return CalculationResult(
        result=result,
        result_formatted=f"{result:.2f}%",
        result_label="Required Annual Yield",
        starting_value=start,
        total_contributions=contrib,
        total_interest=interest,
        total_periods=periods,
        frequency_label=request.frequency,
        calculation_date=datetime.now().isoformat()
    )


@app.post("/calculate/required-contribution", response_model=CalculationResult)
async def api_required_contribution(request: RequiredContributionRequest):
    """
    Calculate Required Periodic Contribution (Solve for PMT)
    
    Returns the periodic contribution amount needed to reach your target
    given your starting amount, expected yield, and time period.
    """
    freq = get_frequency(request.frequency)
    result, start, contrib, interest, periods = calculate_required_contribution(
        request.present_value,
        request.years,
        freq,
        request.annual_yield,
        request.target_fv
    )
    
    return CalculationResult(
        result=result,
        result_formatted=f"${result:,.2f}",
        result_label=f"Required {request.frequency} Contribution",
        starting_value=start,
        total_contributions=contrib,
        total_interest=interest,
        total_periods=periods,
        frequency_label=request.frequency,
        calculation_date=datetime.now().isoformat()
    )


@app.get("/frequencies")
async def get_frequencies():
    """Get available contribution frequencies"""
    return {
        "frequencies": list(FREQ_MAP.keys()),
        "periods_per_year": FREQ_MAP
    }


# ============================================
# CRON ENDPOINT - For automated daily updates
# ============================================

@app.get("/cron/{action}")
async def cron_endpoint(action: str, key: str = ""):
    """
    Cron endpoint for automated daily price updates and snapshots.
    
    Usage:
        GET /cron/update_prices?key=YOUR_SECRET_KEY
        GET /cron/snapshot?key=YOUR_SECRET_KEY  
        GET /cron/daily_update?key=YOUR_SECRET_KEY (both prices + snapshot)
    """
    import os
    
    # Validate secret key
    expected_key = os.environ.get("CRON_SECRET_KEY", "")
    if not expected_key:
        raise HTTPException(status_code=500, detail="CRON_SECRET_KEY not configured on server")
    
    if key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid key")
    
    if action not in ["update_prices", "snapshot", "daily_update"]:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}. Use: update_prices, snapshot, or daily_update")
    
    try:
        from auto_price_scheduler import run_price_update_job
        run_price_update_job()
        return {"status": "OK", "action": action, "message": f"Cron '{action}' executed successfully"}
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Import error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting FastAPI Financial Planner Backend...")
    print("📍 API available at: http://localhost:8000")
    print("📚 API Documentation: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
