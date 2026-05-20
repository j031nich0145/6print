"""
load_cities_snowflake.py
────────────────────────
Loads cities_final.csv directly into Snowflake via Python connector.
Run once after schema_migration.sql has been applied.

Usage:
    cd ~/Documents/BUILD/6print
    source backend/.venv/bin/activate
    python scripts/load_cities_snowflake.py
"""
import csv, os, sys
from pathlib import Path
from dotenv import load_dotenv
import snowflake.connector

load_dotenv()

CSV_PATH = Path(__file__).parent.parent / "cities_final.csv"

def main():
    print(f"Loading {CSV_PATH} …")
    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append((
                r["location"], r["country"], r["country_code"],
                r["region"], float(r["lat"]), float(r["lon"]), int(r["population"]),
            ))
    print(f"  {len(rows)} cities read from CSV")

    conn = snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
    )
    cur = conn.cursor()

    # Truncate first so re-runs are idempotent
    cur.execute("TRUNCATE TABLE IF EXISTS cities")

    cur.executemany(
        """INSERT INTO cities
           (location, country, country_code, region, lat, lon, population)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        rows,
    )
    conn.commit()

    cur.execute("SELECT region, COUNT(*) AS n FROM cities GROUP BY region ORDER BY n DESC")
    print("\nLoaded — breakdown by region:")
    for region, n in cur.fetchall():
        print(f"  {region}: {n}")

    cur.execute("SELECT COUNT(*) FROM cities")
    total = cur.fetchone()[0]
    print(f"\n✓ {total} cities in Snowflake")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()