"""
Gradio-based Financial Planner - Alternative UI Demo
Run with: python gradio_planner.py
"""

import gradio as gr

def calculate_future_value(present_value, investment_period, contribution_frequency, expected_yield, contribution_amount):
    """Calculate Future Portfolio Value (Solve for FV)"""
    freq_map = {"Annually": 1, "Semiannually": 2, "Quarterly": 4, "Monthly": 12, "Weekly": 52}
    freq = freq_map.get(contribution_frequency, 1)
    
    total_periods = int(investment_period * freq)
    periodic_rate = (expected_yield / 100) / freq
    
    if periodic_rate > 0:
        fv_pv = present_value * ((1 + periodic_rate) ** total_periods)
        fv_pmt = contribution_amount * (((1 + periodic_rate) ** total_periods - 1) / periodic_rate)
        result = fv_pv + fv_pmt
    else:
        result = present_value + (contribution_amount * total_periods)
    
    total_contributions = present_value + (contribution_amount * total_periods)
    total_interest = result - total_contributions
    
    return (
        f"${result:,.2f}",
        f"${present_value:,.2f}",
        f"${contribution_amount * total_periods:,.2f}",
        f"${total_interest:,.2f}",
        f"{total_periods:,} periods over {investment_period} years"
    )

def calculate_required_yield(present_value, investment_period, contribution_frequency, target_fv, contribution_amount):
    """Calculate Required Yield % (Solve for Rate)"""
    freq_map = {"Annually": 1, "Semiannually": 2, "Quarterly": 4, "Monthly": 12, "Weekly": 52}
    freq = freq_map.get(contribution_frequency, 1)
    
    total_periods = int(investment_period * freq)
    total_contributions = present_value + (contribution_amount * total_periods)
    
    if target_fv <= total_contributions:
        return ("0.00%", f"${present_value:,.2f}", f"${contribution_amount * total_periods:,.2f}", "$0.00", "No yield needed - contributions cover target")
    
    # Binary search for rate
    low_rate, high_rate = 0.0001, 1.0
    
    for _ in range(100):
        mid_rate = (low_rate + high_rate) / 2
        periodic_rate = mid_rate / freq
        
        if periodic_rate > 0:
            fv_pv = present_value * ((1 + periodic_rate) ** total_periods)
            fv_pmt = contribution_amount * (((1 + periodic_rate) ** total_periods - 1) / periodic_rate)
            calc_fv = fv_pv + fv_pmt
        else:
            calc_fv = present_value + (contribution_amount * total_periods)
        
        if abs(calc_fv - target_fv) < 0.01:
            break
        elif calc_fv < target_fv:
            low_rate = mid_rate
        else:
            high_rate = mid_rate
    
    result_rate = mid_rate * 100
    total_interest = target_fv - total_contributions
    
    return (
        f"{result_rate:.2f}%",
        f"${present_value:,.2f}",
        f"${contribution_amount * total_periods:,.2f}",
        f"${total_interest:,.2f}",
        f"To reach ${target_fv:,.2f}"
    )

def calculate_required_contribution(present_value, investment_period, contribution_frequency, expected_yield, target_fv):
    """Calculate Required Contribution (Solve for PMT)"""
    freq_map = {"Annually": 1, "Semiannually": 2, "Quarterly": 4, "Monthly": 12, "Weekly": 52}
    freq = freq_map.get(contribution_frequency, 1)
    
    total_periods = int(investment_period * freq)
    periodic_rate = (expected_yield / 100) / freq
    
    if periodic_rate > 0:
        fv_from_pv = present_value * ((1 + periodic_rate) ** total_periods)
        remaining_fv = target_fv - fv_from_pv
        annuity_factor = ((1 + periodic_rate) ** total_periods - 1) / periodic_rate
        required_pmt = remaining_fv / annuity_factor if annuity_factor > 0 else 0
    else:
        required_pmt = (target_fv - present_value) / total_periods if total_periods > 0 else 0
    
    required_pmt = max(0, required_pmt)
    total_contributions = present_value + (required_pmt * total_periods)
    total_interest = target_fv - total_contributions
    
    return (
        f"${required_pmt:,.2f}",
        f"${present_value:,.2f}",
        f"${required_pmt * total_periods:,.2f}",
        f"${total_interest:,.2f}",
        f"{contribution_frequency} payment to reach ${target_fv:,.2f}"
    )


# Custom CSS for the Gradio interface
custom_css = """
.gradio-container {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
}
.result-box {
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%) !important;
    border-radius: 16px !important;
    padding: 20px !important;
    color: white !important;
    font-size: 2rem !important;
    font-weight: 700 !important;
    text-align: center !important;
}
.stat-box {
    background: #f8fafc !important;
    border-radius: 12px !important;
    padding: 16px !important;
    border: 1px solid #e2e8f0 !important;
}
.primary-btn {
    background: linear-gradient(90deg, #10b981, #0ea5e9, #8b5cf6) !important;
    border: none !important;
    border-radius: 16px !important;
    padding: 16px 32px !important;
    font-weight: bold !important;
    font-size: 18px !important;
}
"""

# Create the Gradio interface
with gr.Blocks(
    theme=gr.themes.Soft(
        primary_hue="emerald",
        secondary_hue="cyan",
        neutral_hue="slate",
        font=gr.themes.GoogleFont("Inter")
    ),
    css=custom_css,
    title="Financial Planner Pro"
) as demo:
    
    # Header
    gr.Markdown("""
    # 📈 Financial Planner Pro
    ### Advanced Time Value of Money Calculations
    """)
    
    with gr.Tabs() as tabs:
        # Tab 1: Future Value Calculator
        with gr.TabItem("💰 Future Value", id=1):
            gr.Markdown("### Calculate your future portfolio value")
            
            with gr.Row():
                fv_present = gr.Number(label="💰 Present Value (Current Savings)", value=10000, precision=2)
                fv_years = gr.Number(label="📅 Investment Period (Years)", value=10, precision=0, minimum=1, maximum=100)
                fv_freq = gr.Dropdown(
                    choices=["Annually", "Semiannually", "Quarterly", "Monthly", "Weekly"],
                    label="🔄 Contribution Frequency",
                    value="Monthly"
                )
            
            with gr.Row():
                fv_yield = gr.Number(label="📈 Expected Annual Yield (%)", value=8.0, precision=2, minimum=0, maximum=100)
                fv_contrib = gr.Number(label="💵 Contribution Amount", value=500, precision=2)
            
            fv_btn = gr.Button("🧮 Calculate Future Value", variant="primary", size="lg")
            
            with gr.Row():
                fv_result = gr.Textbox(label="🎯 Future Portfolio Value", elem_classes=["result-box"])
            
            with gr.Row():
                fv_start = gr.Textbox(label="Starting Value", elem_classes=["stat-box"])
                fv_total_contrib = gr.Textbox(label="Total Contributions", elem_classes=["stat-box"])
                fv_interest = gr.Textbox(label="Total Interest Earned", elem_classes=["stat-box"])
                fv_info = gr.Textbox(label="Investment Info", elem_classes=["stat-box"])
            
            fv_btn.click(
                calculate_future_value,
                inputs=[fv_present, fv_years, fv_freq, fv_yield, fv_contrib],
                outputs=[fv_result, fv_start, fv_total_contrib, fv_interest, fv_info]
            )
        
        # Tab 2: Required Yield Calculator
        with gr.TabItem("📈 Required Yield", id=2):
            gr.Markdown("### Find the yield needed to reach your target")
            
            with gr.Row():
                ry_present = gr.Number(label="💰 Present Value (Current Savings)", value=10000, precision=2)
                ry_years = gr.Number(label="📅 Investment Period (Years)", value=10, precision=0, minimum=1, maximum=100)
                ry_freq = gr.Dropdown(
                    choices=["Annually", "Semiannually", "Quarterly", "Monthly", "Weekly"],
                    label="🔄 Contribution Frequency",
                    value="Monthly"
                )
            
            with gr.Row():
                ry_target = gr.Number(label="🎯 Target Future Value", value=100000, precision=2)
                ry_contrib = gr.Number(label="💵 Contribution Amount", value=500, precision=2)
            
            ry_btn = gr.Button("🧮 Calculate Required Yield", variant="primary", size="lg")
            
            with gr.Row():
                ry_result = gr.Textbox(label="📈 Required Annual Yield", elem_classes=["result-box"])
            
            with gr.Row():
                ry_start = gr.Textbox(label="Starting Value", elem_classes=["stat-box"])
                ry_total_contrib = gr.Textbox(label="Total Contributions", elem_classes=["stat-box"])
                ry_interest = gr.Textbox(label="Total Interest Needed", elem_classes=["stat-box"])
                ry_info = gr.Textbox(label="Goal Info", elem_classes=["stat-box"])
            
            ry_btn.click(
                calculate_required_yield,
                inputs=[ry_present, ry_years, ry_freq, ry_target, ry_contrib],
                outputs=[ry_result, ry_start, ry_total_contrib, ry_interest, ry_info]
            )
        
        # Tab 3: Required Contribution Calculator
        with gr.TabItem("💵 Required Contribution", id=3):
            gr.Markdown("### Find the contribution needed to reach your target")
            
            with gr.Row():
                rc_present = gr.Number(label="💰 Present Value (Current Savings)", value=10000, precision=2)
                rc_years = gr.Number(label="📅 Investment Period (Years)", value=10, precision=0, minimum=1, maximum=100)
                rc_freq = gr.Dropdown(
                    choices=["Annually", "Semiannually", "Quarterly", "Monthly", "Weekly"],
                    label="🔄 Contribution Frequency",
                    value="Monthly"
                )
            
            with gr.Row():
                rc_yield = gr.Number(label="📈 Expected Annual Yield (%)", value=8.0, precision=2, minimum=0, maximum=100)
                rc_target = gr.Number(label="🎯 Target Future Value", value=100000, precision=2)
            
            rc_btn = gr.Button("🧮 Calculate Required Contribution", variant="primary", size="lg")
            
            with gr.Row():
                rc_result = gr.Textbox(label="💵 Required Contribution", elem_classes=["result-box"])
            
            with gr.Row():
                rc_start = gr.Textbox(label="Starting Value", elem_classes=["stat-box"])
                rc_total_contrib = gr.Textbox(label="Total Contributions", elem_classes=["stat-box"])
                rc_interest = gr.Textbox(label="Total Interest Earned", elem_classes=["stat-box"])
                rc_info = gr.Textbox(label="Payment Info", elem_classes=["stat-box"])
            
            rc_btn.click(
                calculate_required_contribution,
                inputs=[rc_present, rc_years, rc_freq, rc_yield, rc_target],
                outputs=[rc_result, rc_start, rc_total_contrib, rc_interest, rc_info]
            )
    
    gr.Markdown("""
    ---
    ### 📊 About This Calculator
    This Financial Planner uses Time Value of Money (TVM) calculations to help you:
    - **Future Value**: See how your investments will grow over time
    - **Required Yield**: Determine what return you need to reach your goals
    - **Required Contribution**: Calculate how much to save regularly
    
    *Built with Gradio for enhanced UI experience*
    """)

if __name__ == "__main__":
    print("🚀 Starting Gradio Financial Planner...")
    print("📍 Access at: http://localhost:7860")
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        show_error=True
    )
