from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from dotenv import load_dotenv
import snowflake.connector, os, json

load_dotenv()
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://6print.org",
        "https://www.6print.org",
        "https://6print.pages.dev",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
            MAX(population)               AS population,
            ROUND(AVG(us_aqi))            AS us_aqi,
            ROUND(AVG(european_aqi))      AS european_aqi,
            ROUND(AVG(pm2_5),1)           AS pm2_5,
            ROUND(AVG(pm10),1)            AS pm10,
            ROUND(AVG(carbon_monoxide),1) AS carbon_monoxide,
            ROUND(AVG(nitrogen_dioxide),1) AS nitrogen_dioxide,
            ROUND(AVG(sulphur_dioxide),1)  AS sulphur_dioxide,
            ROUND(AVG(ozone),1)           AS ozone,
            ROUND(AVG(dust),1)            AS dust,
            ROUND(AVG(uv_index),1)        AS uv_index,
            COUNT(DISTINCT date)          AS days_of_data
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

# ── Chat (streaming SSE) ──────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[dict] = None        # structured context from frontend

def _build_system_prompt(ctx: dict) -> str:
    city_count  = ctx.get("cityCount", 0)
    time_window = ctx.get("timeWindow", "live")
    region      = ctx.get("region", "All Regions")
    global_avg  = ctx.get("globalAvgAqi")
    top5_worst  = ctx.get("top5Worst", [])
    top5_best   = ctx.get("top5Best", [])
    top_co      = ctx.get("topCO")
    top_uv      = ctx.get("topUV")

    def _city_list(cities):
        return ", ".join(f"{c['location']} ({c['value']})" for c in cities) or "N/A"

    co_line = f"\n- Highest CO: {top_co['location']} ({top_co['value']:.0f} μg/m³)" if top_co else ""
    uv_line = f"\n- Highest UV: {top_uv['location']} (UV {top_uv['value']:.1f})" if top_uv else ""

    return f"""You are an expert air quality analyst for Carbon Monitor, a real-time global air quality analytics platform powered by Open-Meteo and CAMS (Copernicus Atmosphere Monitoring Service). Historical data spans 2023 to present; notable events include the 2023 Canadian wildfire season (June–Aug).

## Live Data Snapshot
- Cities monitored: {city_count}
- Time window: {time_window}
- Region filter: {region}
- Global average US AQI: {f"{global_avg:.1f}" if global_avg is not None else "N/A"}
- Most polluted: {_city_list(top5_worst)}
- Cleanest: {_city_list(top5_best)}{co_line}{uv_line}

## Metrics & WHO Guidelines
- **US AQI**: 0–50 Good · 51–100 Moderate · 101–150 Unhealthy (Sensitive) · 151–200 Unhealthy · 201–300 Very Unhealthy · 301+ Hazardous
- **PM2.5**: WHO 24hr 15 μg/m³, annual 5 μg/m³
- **PM10**: WHO 24hr 45 μg/m³
- **NO₂**: WHO annual 10 μg/m³
- **O₃**: WHO 8hr 100 μg/m³
- **CO**: WHO 24hr 4,000 μg/m³ (combustion proxy)
- **UV Index**: Low 0–2 · Moderate 3–5 · High 6–7 · Very High 8–10 · Extreme 11+
- **Dust**: Windblown particulate — high in Sahara-adjacent and arid cities

## Response Style
- Be concise and precise. Use **bold** for key values, `backticks` for metric values.
- Bullet lists for comparisons. 2–4 paragraphs max unless detail is requested.
- Cite WHO guidelines when relevant to health questions.
- For trends or historical deep-dives, suggest the Charts tab.
- You can discuss air quality science, health, policy, climate, and any city in the dataset.
"""

@app.post("/api/chat")
def chat(req: ChatRequest):
    from groq import Groq
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        def _err():
            yield 'data: {"content": "Error: GROQ_API_KEY not set in .env"}\n\n'
            yield "data: [DONE]\n\n"
        return StreamingResponse(_err(), media_type="text/event-stream")

    client = Groq(api_key=api_key)
    ctx    = req.context or {}
    system = _build_system_prompt(ctx)

    def stream():
        try:
            completion = client.chat.completions.create(
                model       = "llama-3.3-70b-versatile",
                messages    = [{"role": "system", "content": system}]
                             + [{"role": m.role, "content": m.content} for m in req.messages],
                temperature = 0.4,
                max_tokens  = 1024,
                stream      = True,
            )
            for chunk in completion:
                token = chunk.choices[0].delta.content
                if token:
                    yield f"data: {json.dumps({'content': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type = "text/event-stream",
        headers    = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )