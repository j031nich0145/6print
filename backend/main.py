from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import snowflake.connector, os

load_dotenv()
app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def query_sf(sql):
    conn = snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USER"), password=os.getenv("SNOWFLAKE_PASSWORD"),
        account=os.getenv("SNOWFLAKE_ACCOUNT"), warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"), schema=os.getenv("SNOWFLAKE_SCHEMA"),
    )
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0].lower() for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows

@app.get("/api/health")
def health(): return {"status": "ok"}

@app.get("/api/aqi")
def get_aqi():
    return query_sf("""
        SELECT location, country, region, province, lat, lon, population,
               pm2_5, pm10, nitrogen_dioxide, sulphur_dioxide, ozone,
               dust, uv_index, uv_index_clear_sky, us_aqi, european_aqi, measured_at
        FROM clean_air_quality
        QUALIFY ROW_NUMBER() OVER (PARTITION BY location ORDER BY loaded_at DESC) = 1
        ORDER BY us_aqi DESC NULLS LAST
    """)
