"""Debug Yahoo Finance endpoint"""
import requests
import json

symbol = "AAPL"
url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={symbol}"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

print(f"Testing: {url}")
response = requests.get(url, headers=headers, timeout=10)
print(f"Status: {response.status_code}")
print(f"Response length: {len(response.text)}")

if response.status_code == 200:
    data = response.json()
    print(f"\nJSON keys: {data.keys()}")
    print(f"\nFull response:\n{json.dumps(data, indent=2)[:1000]}...")
