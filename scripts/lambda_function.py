import csv
import io
import json
import time
import boto3
import urllib.request
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

s3     = boto3.client("s3")
BUCKET = "my-6-data-lake"
CITIES_KEY = "config/cities_final.csv"
BATCH_SIZE = 300  # safe limit for POST body; well under Open-Meteo's limits

METRICS = ",".join([
    "pm2_5","pm10","carbon_monoxide","nitrogen_dioxide",
    "sulphur_dioxide","ozone","dust","uv_index","uv_index_clear_sky",
    "us_aqi","european_aqi",
])

METRIC_KEYS = [
    "pm2_5","pm10","carbon_monoxide","nitrogen_dioxide",
    "sulphur_dioxide","ozone","dust","uv_index","uv_index_clear_sky",
    "us_aqi","european_aqi",
]

def load_cities():
    obj     = s3.get_object(Bucket=BUCKET, Key=CITIES_KEY)
    content = obj["Body"].read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(content)))

def fetch_batch(batch):
    """One Open-Meteo call for up to 300 cities using POST to avoid URI length limits."""
    lats = [float(c["lat"]) for c in batch]
    lons = [float(c["lon"]) for c in batch]
    payload = json.dumps({
        "latitude":     lats,
        "longitude":    lons,
        "hourly":       METRIC_KEYS,
        "forecast_days": 1,
        "past_hours":   1,
        "domains":      "auto",
    }).encode()
    req = urllib.request.Request(
        "https://air-quality-api.open-meteo.com/v1/air-quality",
        data    = payload,
        headers = {
            "User-Agent":   "my-6-carbon-platform",
            "Content-Type": "application/json",
        },
        method  = "POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return data if isinstance(data, list) else [data]

def parse_latest(result, city):
    """Extract the most recent non-null hour from one city result."""
    hourly = result.get("hourly", {})
    times  = hourly.get("time", [])
    pm25   = hourly.get("pm2_5", [])

    latest = next(
        (i for i in range(len(pm25) - 1, -1, -1) if pm25[i] is not None),
        None
    )
    if latest is None:
        return None

    def safe(key):
        arr = hourly.get(key, [])
        return arr[latest] if latest < len(arr) else None

    return {
        "location":           city["location"],
        "country":            city["country_code"],
        "region":             city["region"],
        "province":           "",
        "lat":                float(city["lat"]),
        "lon":                float(city["lon"]),
        "population":         int(city["population"]),
        "pm2_5":              safe("pm2_5"),
        "pm10":               safe("pm10"),
        "carbon_monoxide":    safe("carbon_monoxide"),
        "nitrogen_dioxide":   safe("nitrogen_dioxide"),
        "sulphur_dioxide":    safe("sulphur_dioxide"),
        "ozone":              safe("ozone"),
        "dust":               safe("dust"),
        "uv_index":           safe("uv_index"),
        "uv_index_clear_sky": safe("uv_index_clear_sky"),
        "us_aqi":             safe("us_aqi"),
        "european_aqi":       safe("european_aqi"),
        "timestamp":          times[latest] if latest < len(times) else None,
    }

def process_batch(batch):
    """Fetch one batch with retry on 429. Returns (results, errors)."""
    results, errors = [], []
    for attempt in range(4):
        try:
            api_results = fetch_batch(batch)
            for city, result in zip(batch, api_results):
                try:
                    row = parse_latest(result, city)
                    if row:
                        results.append(row)
                except Exception as e:
                    errors.append({"city": city["location"], "error": str(e)})
            return results, errors
        except Exception as e:
            if "429" in str(e) and attempt < 3:
                time.sleep(15)
            else:
                errors.append({"batch_start": batch[0]["location"], "error": str(e)})
                return results, errors
    return results, errors

def lambda_handler(event, context):
    cities  = load_cities()
    batches = [cities[i:i+BATCH_SIZE] for i in range(0, len(cities), BATCH_SIZE)]

    all_results, all_errors = [], []

    # Sequential with a short pause — avoids 429 rate limiting on free tier
    for i, batch in enumerate(batches):
        results, errors = process_batch(batch)
        all_results.extend(results)
        all_errors.extend(errors)
        if i < len(batches) - 1:
            time.sleep(3)

    now = datetime.utcnow()
    key = (
        f"raw/air_quality/"
        f"year={now.year}/month={now.month}/day={now.day}/"
        f"data_{now.hour}_{now.minute}.json"
    )

    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=json.dumps({"results": all_results, "errors": all_errors}),
    )

    result = {
        "status":        "ok",
        "key":           key,
        "cities_loaded": len(all_results),
        "errors":        len(all_errors),
        "error_detail":  all_errors if all_errors else None,
    }

    # Raise if we lost more than 5% of cities — triggers CloudWatch Errors metric
    expected = len(cities)
    if len(all_results) < expected * 0.95:
        raise Exception(
            f"Only loaded {len(all_results)}/{expected} cities "
            f"({len(all_errors)} errors). Check Open-Meteo rate limits. "
            f"First error: {all_errors[0] if all_errors else 'unknown'}"
        )

    return result