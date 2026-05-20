# Carbon Monitor — 1400-City Pipeline Upgrade

## What changes
| | Before | After |
|---|---|---|
| Cities | 157 | ~1,400 |
| Lambda calls/day | ~157 × 48 = 7,536 | 3 batches × 288 = 864 |
| Open-Meteo calls/day | 7,536 | 864 |
| Snowflake schema | flat rows with metadata | `cities` dim + `aq_readings` fact |
| Refresh interval | 30 min | 5 min |

---

## Step 1 — Upload city CSV to S3

```bash
aws s3 cp cities_final.csv s3://YOUR-BUCKET/config/cities_final.csv
```

---

## Step 2 — Run Snowflake migration

Open **Snowflake UI → Worksheets**, paste `schema_migration.sql` and run.
This creates:
- `cities` table
- `aq_readings` fact table (no location metadata, just metrics)
- `clean_air_quality` view (backward-compatible JOIN)
- `air_quality_combined` view (backward-compatible JOIN)
- Backfills `aq_readings` from your existing `air_quality_combined`

```sql
-- Verify after running:
SELECT region, COUNT(*) FROM cities GROUP BY region ORDER BY 2 DESC;
SELECT COUNT(*) FROM aq_readings;
```

---

## Step 3 — Load cities into Snowflake

```bash
cd ~/Documents/BUILD/6print
source backend/.venv/bin/activate
python3 scripts/load_cities_snowflake.py
```

Expected output:
```
✓ 1396 cities in Snowflake
  United States: 336
  Europe: 220
  Asia: 220
  ...
```

---

## Step 4 — Deploy updated Lambda

1. In AWS Lambda console, open your ingest function
2. Replace `lambda_function.py` with the new version
3. Add environment variables if missing:
   ```
   S3_BUCKET=your-bucket
   SNOWFLAKE_ACCOUNT=rciqlzm-vjb70706
   SNOWFLAKE_USER=...
   SNOWFLAKE_PASSWORD=...
   SNOWFLAKE_DATABASE=carbon_db
   SNOWFLAKE_WAREHOUSE=carbon_wh
   SNOWFLAKE_SCHEMA=PUBLIC
   ```
4. **Change EventBridge schedule** from `rate(30 minutes)` → `rate(5 minutes)`
5. Test manually with the Test button — expect ~15-25s runtime for 1400 cities

### Lambda timeout & memory
- Set **timeout → 3 minutes** (was probably 1 min)
- Set **memory → 512 MB** (was probably 128 MB)
- The function makes 3 HTTP calls to Open-Meteo (~2-4s each) + 1 Snowflake insert

---

## Step 5 — Verify data flowing

```bash
# Check latest rows in Snowflake
SELECT location, measured_at, us_aqi
FROM aq_readings
ORDER BY loaded_at DESC
LIMIT 20;

# Check city coverage
SELECT c.region, COUNT(DISTINCT r.location) AS cities_with_data
FROM aq_readings r
JOIN cities c USING (location)
WHERE r.loaded_at >= DATEADD(hour, -1, CURRENT_TIMESTAMP())
GROUP BY c.region ORDER BY 2 DESC;
```

---

## Step 6 — Add population filter to frontend

The backend already has `min_pop` param on `/api/aqi`. Wire it to a slider
in the SidePanel (under LAYERS). Suggested presets:

| Slider | min_pop | Approx cities shown |
|---|---|---|
| All | 0 | ~1,400 |
| 100k+ | 100000 | ~800 |
| 500k+ | 500000 | ~350 |
| 1M+ | 1000000 | ~180 |

---

## Performance notes

**Snowflake query speed** — the `/api/aqi` dedup query uses `QUALIFY ROW_NUMBER()`.
With 1,400 cities × 5-min intervals, rows accumulate fast (~400k/day).
Add this WHERE clause pre-filter to keep it fast:

```sql
-- In backend main.py get_aqi(), add to clauses:
clauses.append("loaded_at >= DATEADD(hour, -2, CURRENT_TIMESTAMP())")
```

This limits the window function scan to the last 2 hours instead of all history.

**Mapbox** — 1,400 GeoJSON points renders fine. No changes needed.

**Recharts bar charts** — already sliced to top 30, so no change needed.

---

## Regenerating the city list

If you want to adjust regional targets or add cities:

```bash
cd ~/Documents/BUILD/6print
python3 scripts/build_city_list.py
# Then re-run steps 1 and 3
```
