import requests

s = requests.Session()

# Try form login
r = s.post("http://127.0.0.1:8004/api/v1/auth/login/form", data={"username": "sager", "password": "sager"})
print("Form login:", r.status_code)
if r.status_code == 200:
    d = r.json()
    token = d.get("data", {}).get("access_token") or d.get("access_token")
    print("Token:", token[:30] if token else "None")
    
    # Try PFM
    r2 = s.get("http://127.0.0.1:8004/api/v1/pfm/snapshots",
               params={"page": 1, "page_size": 100},
               headers={"Authorization": f"Bearer {token}"})
    print("PFM Status:", r2.status_code)
    print("PFM Response:", r2.text[:500])
else:
    print("Login response:", r.text[:300])
    
    # Try register + login
    r3 = s.post("http://127.0.0.1:8004/api/v1/auth/login", json={"email": "sager@test.com", "password": "sager"})
    print("\nJSON login:", r3.status_code, r3.text[:300])
