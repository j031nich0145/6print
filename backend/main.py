from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from dotenv import load_dotenv
import snowflake.connector, os

load_dotenv()
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Snowflake ─────────────────────────────────────────────────────────────────

def query_sf(sql, params=()):
    conn = snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
    )
    cur = conn.cursor()
    cur.execute(sql, params)
    cols = [d[0].lower() for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows

SAFE_METRICS = {
    "us_aqi", "european_aqi", "pm2_5", "pm10",
    "carbon_monoxide", "nitrogen_dioxide", "sulphur_dioxide",
    "ozone", "dust", "uv_index", "uv_index_clear_sky",
}

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}

# ── Current snapshot (latest per city) ───────────────────────────────────────

@app.get("/api/aqi")
def get_aqi(region: Optional[str] = None, min_pop: int = 0):
    clauses = ["1=1"]
    params = []
    if region and region not in ("All Regions", ""):
        clauses.append("region = %s"); params.append(region)
    if min_pop > 0:
        clauses.append(f"population >= {int(min_pop)}")
    where = " AND ".join(clauses)
    sql = f"""
        SELECT location, country, region, province, lat, lon, population,
               pm2_5, pm10, carbon_monoxide, nitrogen_dioxide, sulphur_dioxide,
               ozone, dust, uv_index, uv_index_clear_sky,
               us_aqi, european_aqi, measured_at
        FROM clean_air_quality
        WHERE {where}
        QUALIFY ROW_NUMBER() OVER (PARTITION BY location ORDER BY loaded_at DESC) = 1
        ORDER BY us_aqi DESC NULLS LAST
    """
    return query_sf(sql, tuple(params))

# ── Historical snapshot (city averages over a period) ────────────────────────

@app.get("/api/snapshot")
def get_snapshot(
    days: Optional[int] = None,
    year: Optional[int] = None,
    region: Optional[str] = None,
    min_pop: int = 0,
):
    """
    Returns one averaged row per city for the requested window.
    Used to color the map for historical periods.
    days=30  → last 30 days
    year=2023 → full calendar year 2023
    days=None, year=None → all available data
    """
    clauses = ["1=1"]
    params = []

    if year:
        clauses.append("YEAR(date) = %s"); params.append(year)
    elif days:
        clauses.append(f"date >= DATEADD(day, -{int(days)}, CURRENT_DATE())")

    if region and region not in ("All Regions", ""):
        clauses.append("region = %s"); params.append(region)
    if min_pop > 0:
        clauses.append(f"population >= {int(min_pop)}")

    where = " AND ".join(clauses)

    sql = f"""
        SELECT
            location, country, region, province, lat, lon,
            MAX(population)              AS population,
            ROUND(AVG(us_aqi))           AS us_aqi,
            ROUND(AVG(european_aqi))     AS european_aqi,
            ROUND(AVG(pm2_5),1)          AS pm2_5,
            ROUND(AVG(pm10),1)           AS pm10,
            ROUND(AVG(carbon_monoxide),1) AS carbon_monoxide,
            ROUND(AVG(nitrogen_dioxide),1) AS nitrogen_dioxide,
            ROUND(AVG(sulphur_dioxide),1)  AS sulphur_dioxide,
            ROUND(AVG(ozone),1)          AS ozone,
            ROUND(AVG(dust),1)           AS dust,
            ROUND(AVG(uv_index),1)       AS uv_index,
            COUNT(DISTINCT date)         AS days_of_data
        FROM air_quality_combined
        WHERE {where}
        GROUP BY location, country, region, province, lat, lon
        ORDER BY us_aqi DESC NULLS LAST
    """
    return query_sf(sql, tuple(params))

# ── City trend (time series for charts) ──────────────────────────────────────

@app.get("/api/trend")
def get_trend(
    city: str,
    metric: str = "us_aqi",
    days: Optional[int] = None,
    year: Optional[int] = None,
):
    if metric not in SAFE_METRICS:
        metric = "us_aqi"

    clauses = ["location = %s"]
    params = [city]

    if year:
        clauses.append("YEAR(date) = %s"); params.append(year)
    elif days:
        clauses.append(f"date >= DATEADD(day, -{int(days)}, CURRENT_DATE())")

    where = " AND ".join(clauses)

    sql = f"""
        SELECT date, location, country, region,
               {metric}, us_aqi, pm2_5, dust
        FROM air_quality_combined
        WHERE {where}
        ORDER BY date ASC
    """
    return query_sf(sql, tuple(params))

# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context_data: Optional[str] = None

@app.post("/api/chat")
def chat(req: ChatRequest):
    from groq import Groq
    groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
    ctx = f"\n\nLive data snapshot:\n{req.context_data}" if req.context_data else ""
    system = f"""You are a scientific environmental analyst embedded in a global air quality dashboard.
Metrics: PM2.5, PM10, CO, NO₂, SO₂, Ozone, Dust, UV Index, US AQI, European AQI.
WHO guidelines: PM2.5 annual 5 μg/m³, NO₂ annual 10 μg/m³, Ozone 8h 100 μg/m³.
US AQI: Good 0-50, Moderate 51-100, Unhealthy(sensitive) 101-150, Unhealthy 151-200, Very Unhealthy 201-300, Hazardous 301+.
Historical data available 2023-01-01 to present. Notable events: 2023 Canadian wildfire season (June-Aug).
Be precise. Cite specific values. Plain text only.{ctx}"""
    resp = groq.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": system}]
                 + [{"role": m.role, "content": m.content} for m in req.messages],
        temperature=0.2, max_tokens=800,
    )
    return {"reply": resp.choices[0].message.content}