"""
backfill_historical.py  --  Carbon Monitor historical backfill
All 1396 cities from 2022-08-01 to yesterday.
One city at a time, 3s pause between requests (free tier safe).
Resume-safe: skips already-uploaded cities.

Run:
    python scripts/backfill_historical.py
"""
import csv, json, time, urllib.request, urllib.error
import boto3
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

S3_BUCKET   = "my-6-data-lake"
S3_PREFIX   = "historical/air_quality/daily"
CITIES_CSV  = Path(__file__).parent.parent / "cities_final.csv"
START_DATE  = "2022-08-01"
END_DATE    = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
WORKERS     = 1     # one at a time -- free tier hourly limit
PAUSE_SECS  = 3     # seconds between requests (~20/min, safe)
METRICS     = "pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,uv_index,uv_index_clear_sky,us_aqi,european_aqi"
METRIC_KEYS = METRICS.split(",")

s3 = boto3.client("s3")

def load_cities():
    with open(CITIES_CSV, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def s3_key(city):
    safe = city["location"].lower().replace(" ","_").replace(".","").replace("'","").replace("/","")
    return f"{S3_PREFIX}/{city['country_code'].lower()}_{safe}.json"

def get_existing_keys():
    existing = set()
    try:
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=S3_PREFIX):
            for obj in page.get("Contents", []):
                existing.add(obj["Key"])
    except Exception:
        pass
    return existing

def fetch_city(city):
    url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={city['lat']}&longitude={city['lon']}"
        f"&hourly={METRICS}"
        f"&start_date={START_DATE}&end_date={END_DATE}"
        "&domains=auto"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "my-6-carbon-platform"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 429 and attempt < 4:
                wait = 60 * (attempt + 1)   # 60s, 120s, 180s, 240s
                print(f"    Rate limited -- waiting {wait}s...")
                time.sleep(wait)
            else:
                raise Exception(f"HTTP {e.code}: {body[:200]}")
        except Exception as e:
            if attempt < 4:
                time.sleep(10)
            else:
                raise

def aggregate_daily(city, hourly_data):
    hourly  = hourly_data.get("hourly", {})
    times   = hourly.get("time", [])
    by_date = defaultdict(lambda: defaultdict(list))
    for i, ts in enumerate(times):
        day = ts[:10]
        for key in METRIC_KEYS:
            arr = hourly.get(key, [])
            v   = arr[i] if i < len(arr) else None
            if v is not None:
                by_date[day][key].append(v)
    rows = []
    for day in sorted(by_date):
        row = {
            "location":    city["location"],
            "country":     city["country_code"],
            "region":      city["region"],
            "province":    "",
            "lat":         float(city["lat"]),
            "lon":         float(city["lon"]),
            "population":  int(city["population"]),
            "date":        day,
            "data_source": "historical",
        }
        for key in METRIC_KEYS:
            vals    = by_date[day].get(key, [])
            row[key] = round(sum(vals)/len(vals), 2) if vals else None
        rows.append(row)
    return rows

def process_city(city):
    data = fetch_city(city)
    rows = aggregate_daily(city, data)
    key  = s3_key(city)
    s3.put_object(Bucket=S3_BUCKET, Key=key,
                  Body=json.dumps({"city": city["location"], "rows": rows}))
    time.sleep(PAUSE_SECS)
    return len(rows), key

if __name__ == "__main__":
    cities   = load_cities()
    existing = get_existing_keys()
    todo     = [c for c in cities if s3_key(c) not in existing]
    skipped  = len(cities) - len(todo)

    eta_min  = len(todo) * PAUSE_SECS // 60

    print("=" * 60)
    print("HISTORICAL BACKFILL -- Carbon Monitor")
    print(f"  {len(todo)} cities to fetch, {skipped} already done")
    print(f"  Date range: {START_DATE} -> {END_DATE}")
    print(f"  Estimated time: ~{eta_min} min")
    print(f"  Safe to Ctrl+C and resume anytime")
    print("=" * 60)

    total_days = 0
    errors     = []
    done       = skipped
    t0         = time.time()

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(process_city, c): c for c in todo}
        for fut in as_completed(futures):
            city = futures[fut]
            done += 1
            try:
                days, key = fut.result()
                total_days += days
                pct = done / len(cities) * 100
                elapsed = (time.time() - t0) / 60
                print(f"  [{done:>4}/{len(cities)}] {pct:5.1f}%  OK  {city['location']:<25} {days}d  ({elapsed:.1f}min)")
            except Exception as e:
                errors.append({"city": city["location"], "error": str(e)})
                print(f"  [{done:>4}/{len(cities)}]        ERR {city['location']:<25} {e}")

    elapsed = (time.time() - t0) / 60
    print()
    print("=" * 60)
    print(f"Done in {elapsed:.1f} min")
    print(f"Daily rows uploaded: {total_days:,}")
    print(f"Errors: {len(errors)}")
    for e in errors:
        print(f"  ERR {e['city']}: {e['error']}")
    print("Next: run backfill_snowflake.sql in Snowflake")
    print("=" * 60)