# 6print — Carbon Monitor: Deployment Handoff

## Where We Are

Backend Docker image is built, pushed to DockerHub, and running on Hetzner.
Next session picks up at: GitHub Actions CI/CD → auto-deploy to Hetzner → Cloudflare Pages for frontend.

---

## Full Stack

```
Open-Meteo API (free, no key)
  --> AWS EventBridge (every 10 min)
    --> AWS Lambda (urllib + boto3 only, no layers)
      --> S3 (my-6-data-lake)
        --> Snowflake Task: LOAD_LIVE_AIR_QUALITY (every 11 min, COPY INTO)
          --> Snowflake Task: REFRESH_CLEAN_AIR_QUALITY (chained, rebuilds analytics)
            --> FastAPI backend (Python, Snowflake connector, Groq)
              --> React + Vite frontend (Mapbox GL, Recharts)
                --> Users
```

---

## Repositories

- **GitHub**: https://github.com/j031nich0145/6print (or similar — confirm repo URL)
- **DockerHub**: docker.io/j031nich0145/6print-backend
- **Image**: `j031nich0145/6print-backend:latest`

---

## Project Structure

```
~/Documents/BUILD/6print/
  backend/
    main.py              # FastAPI app — all endpoints
    requirements.txt     # 6 packages only (fastapi, uvicorn, pydantic,
                         #   python-dotenv, snowflake-connector-python, groq)
    Dockerfile           # python:3.12-slim, exposes 8000
    .venv/               # local dev venv (not in Docker)
  frontend/
    src/
      pages/
        AirQuality.jsx   # ~1900 lines, owns shared Mapbox instance
        UVIndex.jsx      # overlay, no map, UV calculator
        CarbonCalculator.jsx  # overlay, no map, CO map + footprint calc
        QueryChat.jsx    # full-page streaming LLM chat
      components/
        KpiCards.jsx     # draggable cards, colormap-aware
      utils/
        colormaps.js     # getMetricColor, aqiStandardColor
    package.json
    vite.config.js
  scripts/
    build_city_list.py       # regenerate cities_final.csv from GeoNames
    load_cities_snowflake.py # load CSV into Snowflake cities table
    backfill_historical.py   # one-time historical pull (done, 54k rows)
    ingest.py                # (not used — Lambda handles ingest)
  cities_final.csv           # 1396 cities with lat/lon/region
  .env                       # ALL secrets live here (root level)
  lambda_function.py         # AWS Lambda source (deployed separately)
```

---

## Backend — Dockerfile

Located at `backend/Dockerfile`:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build: `docker build -t 6print-backend .`
Run locally: `docker run --env-file ../.env -p 8000:8000 6print-backend`

---

## Backend — API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check → `{"status":"ok"}` |
| `/api/aqi` | GET | Latest snapshot per city (params: region, min_pop) |
| `/api/snapshot` | GET | Historical averages (params: days, year, region) |
| `/api/trend` | GET | Time series for one city (params: city, metric, days) |
| `/api/chat` | POST | Streaming SSE chat (Groq llama-3.3-70b-versatile) |

---

## .env Structure

```bash
# Snowflake
SNOWFLAKE_ACCOUNT=rciqlzm-vjb70706
SNOWFLAKE_USER=your_user
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_DATABASE=carbon_db
SNOWFLAKE_WAREHOUSE=carbon_wh
SNOWFLAKE_SCHEMA=PUBLIC

# Groq
GROQ_API_KEY=gsk_...

# Mapbox (frontend only, via VITE_ prefix)
VITE_MAPBOX_TOKEN=pk....
```

---

## Hetzner VPS — Current State

- Docker installed and running
- Container running: `6print-backend`
- Image: `j031nich0145/6print-backend:latest`
- Port: 8000
- Env file: `/opt/6print/.env`
- Restart policy: `--restart always`

**Run command used:**
```bash
docker run -d \
  --name 6print-backend \
  --restart always \
  --env-file /opt/6print/.env \
  -p 8000:8000 \
  j031nich0145/6print-backend:latest
```

**Useful commands on Hetzner:**
```bash
docker ps                          # check running containers
docker logs 6print-backend         # view logs
docker logs 6print-backend -f      # follow logs
docker pull j031nich0145/6print-backend:latest && \
  docker stop 6print-backend && \
  docker rm 6print-backend && \
  docker run -d --name 6print-backend --restart always \
    --env-file /opt/6print/.env -p 8000:8000 \
    j031nich0145/6print-backend:latest   # manual update
```

---

## What Needs To Be Done Next Session

### Step 1 — GitHub Actions CI/CD
On every push to `main`:
1. Build new Docker image
2. Push to DockerHub with `:latest` tag
3. SSH into Hetzner and run update commands

Need to add to GitHub repo → Settings → Secrets:
- `DOCKERHUB_USERNAME` = j031nich0145
- `DOCKERHUB_TOKEN` = DockerHub access token (create at hub.docker.com → Account Settings → Security)
- `HETZNER_HOST` = your VPS IP
- `HETZNER_USER` = root (or your user)
- `HETZNER_SSH_KEY` = private SSH key for Hetzner

Workflow file goes at `.github/workflows/deploy.yml`

### Step 2 — Nginx on Hetzner
Reverse proxy so backend is on port 80 instead of 8000.
Needed before Cloudflare Pages can call it (CORS + clean URL).

```nginx
server {
    listen 80;
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Step 3 — Cloudflare Pages (frontend)
1. Go to dash.cloudflare.com → Pages → Create project
2. Connect GitHub repo
3. Build settings:
   - Build command: `cd frontend && npm run build`
   - Build output: `frontend/dist`
4. Environment variable: `VITE_MAPBOX_TOKEN=pk....`
5. Add `VITE_API_URL=http://YOUR_HETZNER_IP` (or domain later)

Every push to `main` auto-deploys frontend.
Free URL: `6print.pages.dev`

### Step 4 — CORS Update
Once Cloudflare Pages URL is known, update `backend/main.py`:

```python
# Replace allow_origins=["*"] with:
app.add_middleware(CORSMiddleware,
    allow_origins=[
        "https://6print.pages.dev",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Snowflake — Key Objects

**Database:** carbon_db | **Warehouse:** carbon_wh | **Account:** rciqlzm-vjb70706

```
carbon_db.PUBLIC
  cities              -- 1396 cities dimension table
  aq_readings         -- fact table (metrics only)
  clean_air_quality   -- VIEW: aq_readings JOIN cities (latest per city)
  air_quality_combined -- VIEW: all history, daily granularity

carbon_db.ANALYTICS
  clean_air_quality       -- live data table (rebuilt by Snowflake task)
  air_quality_historical  -- backfill data (2022-08-01 to 2026-05-24)

carbon_db.RAW
  raw_air_quality             -- VARIANT, live Lambda JSON
  raw_air_quality_historical  -- VARIANT, backfill JSON

Stages:
  @carbon_db.raw.air_quality_stage  --> s3://my-6-data-lake/raw/air_quality/
  @carbon_db.raw.historical_stage   --> s3://my-6-data-lake/historical/air_quality/daily/

Tasks:
  LOAD_LIVE_AIR_QUALITY       -- every 11 min, COPY INTO raw_air_quality
  REFRESH_CLEAN_AIR_QUALITY   -- chained after above, rebuilds analytics table
```

**Data coverage:**
- Historical: 2022-08-01 → 2026-05-24, 1,913,112 rows
- Realtime: 2026-05-13 → present, ~11k rows (growing every 10 min)

---

## AWS — Lambda + EventBridge

**Lambda:**
- Function name: (confirm in AWS console)
- Runtime: Python 3.12
- Memory: 128MB (uses ~105MB)
- Timeout: 3 minutes
- No layers — urllib + boto3 only
- Source: `lambda_function.py` in repo root

**EventBridge rule:** every 10 minutes
**CloudWatch alarm:** Errors >= 1 → email notification

**Lambda env vars:**
```
S3_BUCKET=my-6-data-lake
SNOWFLAKE_ACCOUNT=rciqlzm-vjb70706
SNOWFLAKE_USER=...
SNOWFLAKE_PASSWORD=...
SNOWFLAKE_DATABASE=carbon_db
SNOWFLAKE_WAREHOUSE=carbon_wh
SNOWFLAKE_SCHEMA=PUBLIC
```

**City list on S3:** `s3://my-6-data-lake/config/cities_final.csv`

---

## Frontend — Key Technical Notes

- **Single Mapbox instance** in AirQuality.jsx, always mounted
- UV and Carbon tabs are transparent overlays on the shared map
- `visibility: hidden` (not `display: none`) to preserve WebGL context
- Chat (QueryChat.jsx) always mounted to preserve conversation state
- VITE_MAPBOX_TOKEN and VITE_API_URL are the only env vars needed at build time

**Local dev:**
```bash
cd frontend
npm run dev   # http://localhost:5173
```

**Build for production:**
```bash
cd frontend
npm run build  # outputs to frontend/dist/
```

---

## Disease Dashboard — Next Project

Planned follow-on using identical architecture.
Full spec in `disease_dash.md`.
Primary data source: disease.sh (free, JSON, updates every 10 min — same Lambda pattern).
Start after Carbon Monitor is stable in production.