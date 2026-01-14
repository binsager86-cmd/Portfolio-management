"""
Dash by Plotly - Professional Dashboard Financial Planner
Run with: python dash_planner.py
Access at: http://localhost:8050
"""

from dash import Dash, html, dcc, Input, Output, State, callback
import dash_bootstrap_components as dbc

# Initialize app with Cyborg theme (dark) - you can also try: DARKLY, SLATE, SUPERHERO, SOLAR
app = Dash(
    __name__, 
    external_stylesheets=[
        dbc.themes.CYBORG,
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
    ],
    title="Financial Planner Pro"
)

# Inject custom CSS via index_string
app.index_string = '''
<!DOCTYPE html>
<html>
    <head>
        {%metas%}
        <title>{%title%}</title>
        {%favicon%}
        {%css%}
        <style>
            .gradient-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            .result-card {
                background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%) !important;
                border-radius: 1rem !important;
                box-shadow: 0 10px 40px rgba(16, 185, 129, 0.3) !important;
            }
            .stat-card {
                background: rgba(255, 255, 255, 0.05) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 0.75rem !important;
                backdrop-filter: blur(10px);
            }
            .input-card {
                background: rgba(255, 255, 255, 0.03) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 1rem !important;
            }
            .calculate-btn {
                background: linear-gradient(90deg, #10b981, #0ea5e9, #8b5cf6) !important;
                border: none !important;
                font-size: 1.2rem !important;
                padding: 1rem !important;
                box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3) !important;
                transition: all 0.3s ease !important;
            }
            .calculate-btn:hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 12px 35px rgba(16, 185, 129, 0.4) !important;
            }
        </style>
    </head>
    <body>
        {%app_entry%}
        <footer>
            {%config%}
            {%scripts%}
            {%renderer%}
        </footer>
    </body>
</html>
'''

# Custom CSS for enhanced styling (used in component styles)
custom_css = """
.gradient-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
"""

# TVM Calculation Functions
def calculate_future_value(pv, years, freq, rate, pmt):
    """Calculate Future Portfolio Value"""
    freq_map = {"Annually": 1, "Semiannually": 2, "Quarterly": 4, "Monthly": 12, "Weekly": 52}
    n = freq_map.get(freq, 1)
    total_periods = int(years * n)
    periodic_rate = (rate / 100) / n
    
    if periodic_rate > 0:
        fv_pv = pv * ((1 + periodic_rate) ** total_periods)
        fv_pmt = pmt * (((1 + periodic_rate) ** total_periods - 1) / periodic_rate)
        result = fv_pv + fv_pmt
    else:
        result = pv + (pmt * total_periods)
    
    return result, pv, pmt * total_periods, result - pv - (pmt * total_periods)


def calculate_required_yield(pv, years, freq, target_fv, pmt):
    """Calculate Required Yield %"""
    freq_map = {"Annually": 1, "Semiannually": 2, "Quarterly": 4, "Monthly": 12, "Weekly": 52}
    n = freq_map.get(freq, 1)
    total_periods = int(years * n)
    total_contributions = pv + (pmt * total_periods)
    
    if target_fv <= total_contributions:
        return 0, pv, pmt * total_periods, 0
    
    low_rate, high_rate = 0.0001, 1.0
    
    for _ in range(100):
        mid_rate = (low_rate + high_rate) / 2
        periodic_rate = mid_rate / n
        
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
    
    return mid_rate * 100, pv, pmt * total_periods, target_fv - total_contributions


def calculate_required_contribution(pv, years, freq, rate, target_fv):
    """Calculate Required Contribution"""
    freq_map = {"Annually": 1, "Semiannually": 2, "Quarterly": 4, "Monthly": 12, "Weekly": 52}
    n = freq_map.get(freq, 1)
    total_periods = int(years * n)
    periodic_rate = (rate / 100) / n
    
    if periodic_rate > 0:
        fv_from_pv = pv * ((1 + periodic_rate) ** total_periods)
        remaining_fv = target_fv - fv_from_pv
        annuity_factor = ((1 + periodic_rate) ** total_periods - 1) / periodic_rate
        required_pmt = remaining_fv / annuity_factor if annuity_factor > 0 else 0
    else:
        required_pmt = (target_fv - pv) / total_periods if total_periods > 0 else 0
    
    required_pmt = max(0, required_pmt)
    total_contributions = pv + (required_pmt * total_periods)
    
    return required_pmt, pv, required_pmt * total_periods, target_fv - total_contributions


# App Layout
app.layout = dbc.Container([
    # Header
    dbc.Row([
        dbc.Col([
            html.H1([
                html.I(className="fas fa-chart-line me-3"),
                "Financial Planner Pro"
            ], className="text-center mb-2 gradient-header", style={"fontSize": "2.5rem", "fontWeight": "700"}),
            html.P("Advanced Time Value of Money Calculations", 
                   className="text-center text-muted mb-4", 
                   style={"fontSize": "1.1rem"})
        ])
    ], className="mt-4"),
    
    # Goal Selection Tabs
    dbc.Tabs([
        # Tab 1: Future Value
        dbc.Tab([
            dbc.Card([
                dbc.CardBody([
                    html.H4([
                        html.Span("📋", className="me-2"),
                        "Inputs"
                    ], className="mb-4", style={"color": "#10b981"}),
                    
                    dbc.Row([
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-money-bill-wave me-2", style={"color": "#10b981"}),
                                "Present Value (Current Savings)"
                            ]),
                            dbc.Input(type="number", value=10000, id="fv-present-value", 
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=4),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-calendar-alt me-2", style={"color": "#0ea5e9"}),
                                "Investment Period (Years)"
                            ]),
                            dbc.Input(type="number", value=10, id="fv-years", min=1, max=100,
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=4),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-sync-alt me-2", style={"color": "#3b82f6"}),
                                "Contribution Frequency"
                            ]),
                            dcc.Dropdown(
                                options=[
                                    {"label": "Annually", "value": "Annually"},
                                    {"label": "Semiannually", "value": "Semiannually"},
                                    {"label": "Quarterly", "value": "Quarterly"},
                                    {"label": "Monthly", "value": "Monthly"},
                                    {"label": "Weekly", "value": "Weekly"}
                                ],
                                value="Monthly",
                                id="fv-frequency",
                                className="mb-3",
                                style={"borderRadius": "12px"}
                            )
                        ], md=4)
                    ]),
                    
                    dbc.Row([
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-chart-line me-2", style={"color": "#8b5cf6"}),
                                "Expected Annual Yield (%)"
                            ]),
                            dbc.Input(type="number", value=8, id="fv-yield", min=0, max=100,
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=6),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-hand-holding-usd me-2", style={"color": "#ec4899"}),
                                "Contribution Amount"
                            ]),
                            dbc.Input(type="number", value=500, id="fv-contribution",
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=6)
                    ])
                ])
            ], className="input-card mb-4"),
            
            dbc.Button([
                html.I(className="fas fa-calculator me-2"),
                "Calculate Future Value"
            ], id="fv-calculate-btn", className="w-100 mb-4 calculate-btn", size="lg"),
            
            # Results
            html.Div(id="fv-results")
            
        ], label="💰 Future Value", tab_id="tab-fv"),
        
        # Tab 2: Required Yield
        dbc.Tab([
            dbc.Card([
                dbc.CardBody([
                    html.H4([
                        html.Span("📋", className="me-2"),
                        "Inputs"
                    ], className="mb-4", style={"color": "#10b981"}),
                    
                    dbc.Row([
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-money-bill-wave me-2", style={"color": "#10b981"}),
                                "Present Value (Current Savings)"
                            ]),
                            dbc.Input(type="number", value=10000, id="ry-present-value",
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=4),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-calendar-alt me-2", style={"color": "#0ea5e9"}),
                                "Investment Period (Years)"
                            ]),
                            dbc.Input(type="number", value=10, id="ry-years", min=1, max=100,
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=4),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-sync-alt me-2", style={"color": "#3b82f6"}),
                                "Contribution Frequency"
                            ]),
                            dcc.Dropdown(
                                options=[
                                    {"label": "Annually", "value": "Annually"},
                                    {"label": "Semiannually", "value": "Semiannually"},
                                    {"label": "Quarterly", "value": "Quarterly"},
                                    {"label": "Monthly", "value": "Monthly"},
                                    {"label": "Weekly", "value": "Weekly"}
                                ],
                                value="Monthly",
                                id="ry-frequency",
                                className="mb-3"
                            )
                        ], md=4)
                    ]),
                    
                    dbc.Row([
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-bullseye me-2", style={"color": "#8b5cf6"}),
                                "Target Future Value"
                            ]),
                            dbc.Input(type="number", value=100000, id="ry-target",
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=6),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-hand-holding-usd me-2", style={"color": "#ec4899"}),
                                "Contribution Amount"
                            ]),
                            dbc.Input(type="number", value=500, id="ry-contribution",
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=6)
                    ])
                ])
            ], className="input-card mb-4"),
            
            dbc.Button([
                html.I(className="fas fa-calculator me-2"),
                "Calculate Required Yield"
            ], id="ry-calculate-btn", className="w-100 mb-4 calculate-btn", size="lg"),
            
            html.Div(id="ry-results")
            
        ], label="📈 Required Yield", tab_id="tab-ry"),
        
        # Tab 3: Required Contribution
        dbc.Tab([
            dbc.Card([
                dbc.CardBody([
                    html.H4([
                        html.Span("📋", className="me-2"),
                        "Inputs"
                    ], className="mb-4", style={"color": "#10b981"}),
                    
                    dbc.Row([
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-money-bill-wave me-2", style={"color": "#10b981"}),
                                "Present Value (Current Savings)"
                            ]),
                            dbc.Input(type="number", value=10000, id="rc-present-value",
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=4),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-calendar-alt me-2", style={"color": "#0ea5e9"}),
                                "Investment Period (Years)"
                            ]),
                            dbc.Input(type="number", value=10, id="rc-years", min=1, max=100,
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=4),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-sync-alt me-2", style={"color": "#3b82f6"}),
                                "Contribution Frequency"
                            ]),
                            dcc.Dropdown(
                                options=[
                                    {"label": "Annually", "value": "Annually"},
                                    {"label": "Semiannually", "value": "Semiannually"},
                                    {"label": "Quarterly", "value": "Quarterly"},
                                    {"label": "Monthly", "value": "Monthly"},
                                    {"label": "Weekly", "value": "Weekly"}
                                ],
                                value="Monthly",
                                id="rc-frequency",
                                className="mb-3"
                            )
                        ], md=4)
                    ]),
                    
                    dbc.Row([
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-chart-line me-2", style={"color": "#8b5cf6"}),
                                "Expected Annual Yield (%)"
                            ]),
                            dbc.Input(type="number", value=8, id="rc-yield", min=0, max=100,
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=6),
                        dbc.Col([
                            dbc.Label([
                                html.I(className="fas fa-bullseye me-2", style={"color": "#ec4899"}),
                                "Target Future Value"
                            ]),
                            dbc.Input(type="number", value=100000, id="rc-target",
                                     className="mb-3", style={"borderRadius": "12px"})
                        ], md=6)
                    ])
                ])
            ], className="input-card mb-4"),
            
            dbc.Button([
                html.I(className="fas fa-calculator me-2"),
                "Calculate Required Contribution"
            ], id="rc-calculate-btn", className="w-100 mb-4 calculate-btn", size="lg"),
            
            html.Div(id="rc-results")
            
        ], label="💵 Required Contribution", tab_id="tab-rc")
        
    ], id="tabs", active_tab="tab-fv", className="mb-4"),
    
    # Footer
    html.Hr(),
    html.P([
        html.I(className="fas fa-info-circle me-2"),
        "Built with Dash by Plotly • Time Value of Money Calculator"
    ], className="text-center text-muted mb-4")
    
], fluid=True, className="py-4", style={
    "background": "linear-gradient(135deg, #1a1a2e, #16213e)",
    "minHeight": "100vh"
})


# Result Card Component
def create_result_card(main_value, main_label, start_val, contrib_val, interest_val):
    return html.Div([
        # Main Result
        dbc.Card([
            dbc.CardBody([
                html.P(main_label.upper(), className="text-white-50 mb-2", 
                       style={"fontSize": "0.875rem", "letterSpacing": "0.05em"}),
                html.H2(main_value, className="text-white mb-0",
                       style={"fontSize": "2.5rem", "fontWeight": "700"})
            ], className="text-center")
        ], className="result-card mb-4"),
        
        # Stats Row
        dbc.Row([
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.P("Starting Value", className="text-muted mb-1", style={"fontSize": "0.75rem"}),
                        html.H5(f"${start_val:,.2f}", className="mb-0")
                    ])
                ], className="stat-card")
            ], md=4),
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.P("Total Contributions", className="text-muted mb-1", style={"fontSize": "0.75rem"}),
                        html.H5(f"${contrib_val:,.2f}", className="mb-0")
                    ])
                ], className="stat-card")
            ], md=4),
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.P("Total Interest", className="text-muted mb-1", style={"fontSize": "0.75rem"}),
                        html.H5(f"${interest_val:,.2f}", className="mb-0", 
                               style={"color": "#10b981" if interest_val >= 0 else "#ef4444"})
                    ])
                ], className="stat-card")
            ], md=4)
        ])
    ])


# Callbacks
@callback(
    Output("fv-results", "children"),
    Input("fv-calculate-btn", "n_clicks"),
    State("fv-present-value", "value"),
    State("fv-years", "value"),
    State("fv-frequency", "value"),
    State("fv-yield", "value"),
    State("fv-contribution", "value"),
    prevent_initial_call=True
)
def calc_future_value(n_clicks, pv, years, freq, rate, pmt):
    if None in [pv, years, freq, rate, pmt]:
        return dbc.Alert("Please fill in all fields", color="warning")
    
    result, start, contrib, interest = calculate_future_value(pv, years, freq, rate, pmt)
    return create_result_card(f"${result:,.2f}", "Future Portfolio Value", start, contrib, interest)


@callback(
    Output("ry-results", "children"),
    Input("ry-calculate-btn", "n_clicks"),
    State("ry-present-value", "value"),
    State("ry-years", "value"),
    State("ry-frequency", "value"),
    State("ry-target", "value"),
    State("ry-contribution", "value"),
    prevent_initial_call=True
)
def calc_required_yield(n_clicks, pv, years, freq, target, pmt):
    if None in [pv, years, freq, target, pmt]:
        return dbc.Alert("Please fill in all fields", color="warning")
    
    result, start, contrib, interest = calculate_required_yield(pv, years, freq, target, pmt)
    return create_result_card(f"{result:.2f}%", "Required Annual Yield", start, contrib, interest)


@callback(
    Output("rc-results", "children"),
    Input("rc-calculate-btn", "n_clicks"),
    State("rc-present-value", "value"),
    State("rc-years", "value"),
    State("rc-frequency", "value"),
    State("rc-yield", "value"),
    State("rc-target", "value"),
    prevent_initial_call=True
)
def calc_required_contribution(n_clicks, pv, years, freq, rate, target):
    if None in [pv, years, freq, rate, target]:
        return dbc.Alert("Please fill in all fields", color="warning")
    
    result, start, contrib, interest = calculate_required_contribution(pv, years, freq, rate, target)
    return create_result_card(f"${result:,.2f}", "Required Contribution", start, contrib, interest)


if __name__ == "__main__":
    print("🚀 Starting Dash Financial Planner...")
    print("📍 Access at: http://localhost:8050")
    app.run(debug=True, port=8050)
