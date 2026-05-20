"""
Run this on your Ubuntu machine to see the exact 400 error message.
    python debug_api.py
"""
import urllib.request, urllib.error, json

print("Test 1: single city, start/end date, no domains param")
url = ("https://air-quality-api.open-meteo.com/v1/air-quality"
       "?latitude=49.28&longitude=-123.12"
       "&hourly=pm2_5,us_aqi"
       "&start_date=2024-01-01&end_date=2024-01-03")
try:
    req = urllib.request.Request(url, headers={"User-Agent": "my-6-carbon-platform"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())
        print("  OK — times:", d.get("hourly",{}).get("time",[])[0:2])
except urllib.error.HTTPError as e:
    print(f"  {e.code}: {e.read().decode()}")

print()
print("Test 2: single city, start/end date, domains=auto")
url = ("https://air-quality-api.open-meteo.com/v1/air-quality"
       "?latitude=49.28&longitude=-123.12"
       "&hourly=pm2_5,us_aqi"
       "&start_date=2024-01-01&end_date=2024-01-03"
       "&domains=auto")
try:
    req = urllib.request.Request(url, headers={"User-Agent": "my-6-carbon-platform"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())
        print("  OK — times:", d.get("hourly",{}).get("time",[])[0:2])
except urllib.error.HTTPError as e:
    print(f"  {e.code}: {e.read().decode()}")

print()
print("Test 3: two cities, start/end date, no domains param")
url = ("https://air-quality-api.open-meteo.com/v1/air-quality"
       "?latitude=49.28,51.51&longitude=-123.12,-0.13"
       "&hourly=pm2_5,us_aqi"
       "&start_date=2024-01-01&end_date=2024-01-03")
try:
    req = urllib.request.Request(url, headers={"User-Agent": "my-6-carbon-platform"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())
        print("  OK — type:", type(d).__name__, "len:", len(d) if isinstance(d, list) else "N/A")
except urllib.error.HTTPError as e:
    print(f"  {e.code}: {e.read().decode()}")

print()
print("Test 4: past_days instead of start/end (92 day limit)")
url = ("https://air-quality-api.open-meteo.com/v1/air-quality"
       "?latitude=49.28,51.51&longitude=-123.12,-0.13"
       "&hourly=pm2_5,us_aqi"
       "&past_days=92&forecast_days=0")
try:
    req = urllib.request.Request(url, headers={"User-Agent": "my-6-carbon-platform"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())
        print("  OK — type:", type(d).__name__)
except urllib.error.HTTPError as e:
    print(f"  {e.code}: {e.read().decode()}")