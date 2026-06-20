"""
ingest_postgres.py — runs every 10 min via cron on Hetzner.
Replaces: AWS EventBridge -> Lambda -> S3 -> Snowflake Tasks
Fetches Open-Meteo air quality data directly and writes to PostgreSQL.
"""
import urllib.request
import urllib.error
import json
import csv
import os
import time
from datetime import datetime, timezone

import psycopg2

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "dbname": os.getenv("POSTGRES_DB", "carbon_db"),
    "user": os.getenv("POSTGRES_USER"),
    "password": os.getenv("POSTGRES_PASSWORD"),
}

CITIES_CSV = os.getenv("CITIES_CSV", "/opt/6print/cities_final.csv")
REQUEST_TIMEOUT = 10
SLEEP_BETWEEN_REQUESTS = 0.05  # be polite to Open-Meteo


def fetch_open_meteo(lat, lon):
    url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={lat}&longitude={lon}"
        "&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,"
        "ozone,dust,uv_index,uv_index_clear_sky,us_aqi,european_aqi"
    )
    with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as r:
        return json.loads(r.read())


def load_cities():
    with open(CITIES_CSV) as f:
        return list(csv.DictReader(f))


def main():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cities = load_cities()
    now = datetime.now(timezone.utc)

    success, failed = 0, 0

    for city in cities:
        try:
            data = fetch_open_meteo(city["lat"], city["lon"])
            current = data.get("current", {})

            cur.execute(
                """
                INSERT INTO aq_readings
                (location, measured_at, pm2_5, pm10, carbon_monoxide, nitrogen_dioxide,
                 sulphur_dioxide, ozone, dust, uv_index, uv_index_clear_sky,
                 us_aqi, european_aqi)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    city["location"],
                    now,
                    current.get("pm2_5"),
                    current.get("pm10"),
                    current.get("carbon_monoxide"),
                    current.get("nitrogen_dioxide"),
                    current.get("sulphur_dioxide"),
                    current.get("ozone"),
                    current.get("dust"),
                    current.get("uv_index"),
                    current.get("uv_index_clear_sky"),
                    current.get("us_aqi"),
                    current.get("european_aqi"),
                ),
            )
            success += 1
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(f"[network] Failed {city['location']}: {e}")
            failed += 1
            continue
        except Exception as e:
            print(f"[error] Failed {city['location']}: {e}")
            failed += 1
            continue

        time.sleep(SLEEP_BETWEEN_REQUESTS)

    conn.commit()
    cur.close()
    conn.close()

    print(
        f"[{now.isoformat()}] Ingest complete — "
        f"success: {success}, failed: {failed}, total: {len(cities)}"
    )


if __name__ == "__main__":
    main()