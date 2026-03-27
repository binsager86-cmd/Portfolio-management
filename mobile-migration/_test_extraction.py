"""
Test script: Extract financial statements from the 2022 & 2023 PDF
and compare with current DB values to find discrepancies.
"""
import sqlite3
import hashlib
import io
import json
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend-api"))

conn = sqlite3.connect("dev_portfolio.db")
conn.row_factory = sqlite3.Row

# 1. Get API key
user = conn.execute("SELECT gemini_api_key FROM users WHERE id = 2").fetchone()
api_key = user["gemini_api_key"]
print(f"API key: {api_key[:10]}...")

# 2. Get the 2022 & 2023 PDF
pdf_row = conn.execute(
    "SELECT id, filename FROM pdf_uploads WHERE stock_id = 1 ORDER BY id DESC"
).fetchall()
print("\nPDF uploads for stock_id=1:")
for r in pdf_row:
    print(f"  id={r['id']} filename={r['filename']}")

# Find the 2022 & 2023 PDF
pdf_info = None
for r in pdf_row:
    if "2022" in r["filename"] or "2023" in r["filename"]:
        pdf_info = r
        break

if not pdf_info:
    print("ERROR: No 2022/2023 PDF found!")
    sys.exit(1)

pdf_path = os.path.join("backend-api", "app", "uploads", "pdfs", "1", pdf_info["filename"])
print(f"\nUsing PDF: {pdf_path}")
print(f"  Exists: {os.path.exists(pdf_path)}")
print(f"  Size: {os.path.getsize(pdf_path)} bytes")

# 3. Convert PDF to images
from app.services.extraction_service import pdf_to_images, _get_cached_images
from PIL import Image

pdf_bytes = open(pdf_path, "rb").read()
h = hashlib.md5(pdf_bytes).hexdigest()
images = _get_cached_images(h)
if images is None:
    print("\nConverting PDF to images...")
    images = pdf_to_images(pdf_bytes)
else:
    print(f"\nUsing cached images ({len(images)} pages)")

print(f"Got {len(images)} page images")

# 4. Send to Gemini for extraction
from google import genai

prompt = """Extract ALL financial statements from these PDF pages for the years shown.
For EACH statement type found (income statement, balance sheet, cash flow), extract:
- The exact line item names as they appear
- The values for each year column

Output as JSON with this structure:
{
  "statements": [
    {
      "type": "income" | "balance" | "cashflow",
      "currency": "KWD",
      "periods": ["2023-12-31", "2022-12-31"],
      "items": [
        {"name": "Revenue", "values": {"2023-12-31": 78974672, "2022-12-31": 83625055}}
      ]
    }
  ]
}

IMPORTANT:
- Extract values EXACTLY as printed (in the currency unit shown, e.g. KWD)
- Make sure each value is under the CORRECT year column
- Negative values should be negative numbers
- Include ALL line items including subtotals and totals
- Respond with ONLY the JSON, no markdown fences."""

parts = []
for png in images[:10]:
    parts.append(Image.open(io.BytesIO(png)))
parts.append(prompt)

print("\nSending to Gemini for fresh extraction...")
client = genai.Client(api_key=api_key)
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=parts,
)

raw = response.text or "{}"
print(f"\nRaw response length: {len(raw)} chars")

# Parse
import re
cleaned = raw.strip()
if cleaned.startswith("```"):
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

try:
    result = json.loads(cleaned)
except json.JSONDecodeError as e:
    print(f"JSON parse error: {e}")
    print("Raw text:")
    print(raw[:2000])
    sys.exit(1)

# 5. Compare with DB
print("\n" + "="*80)
print("COMPARISON: AI Fresh Extraction vs DB Values")
print("="*80)

for stmt in result.get("statements", []):
    stype = stmt["type"]
    periods = stmt.get("periods", [])
    items = stmt.get("items", [])
    
    print(f"\n{'='*60}")
    print(f"  {stype.upper()} STATEMENT")
    print(f"{'='*60}")
    
    for period in periods:
        # Get DB values for this period
        db_items = conn.execute("""
            SELECT fli.line_item_name, fli.amount, fli.order_index
            FROM financial_statements fs
            JOIN financial_line_items fli ON fli.statement_id = fs.id
            WHERE fs.stock_id = 1 AND fs.statement_type = ? AND fs.period_end_date = ?
            ORDER BY fli.order_index
        """, (stype, period)).fetchall()
        
        db_dict = {r["line_item_name"]: r["amount"] for r in db_items}
        
        print(f"\n  --- {period} ---")
        print(f"  {'Line Item':55s} {'AI Value':>15s} {'DB Value':>15s} {'Match':>6s}")
        print(f"  {'-'*55} {'-'*15} {'-'*15} {'-'*6}")
        
        mismatches = 0
        for item in items:
            ai_val = item["values"].get(period)
            if ai_val is None:
                continue
            name = item["name"]
            db_val = db_dict.get(name)
            
            if db_val is not None:
                match = "OK" if abs(float(ai_val) - float(db_val)) < 1 else "DIFF!"
                if match == "DIFF!":
                    mismatches += 1
                print(f"  {name[:55]:55s} {ai_val:>15,.0f} {db_val:>15,.0f} {match:>6s}")
            else:
                # Try fuzzy match
                found = False
                for db_name, db_amount in db_dict.items():
                    if name.lower()[:20] == db_name.lower()[:20]:
                        match = "OK" if abs(float(ai_val) - float(db_amount)) < 1 else "DIFF!"
                        if match == "DIFF!":
                            mismatches += 1
                        print(f"  {name[:55]:55s} {ai_val:>15,.0f} {db_amount:>15,.0f} {match:>6s}")
                        found = True
                        break
                if not found:
                    print(f"  {name[:55]:55s} {ai_val:>15,.0f} {'(not in DB)':>15s}  NEW")
        
        print(f"  >>> {mismatches} mismatches found for {period}")

conn.close()
print("\nDone!")
