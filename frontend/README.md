# 6print — Carbon Monitor

Global real-time air quality analytics platform. 1389 cities, live data every 10 minutes, interactive Mapbox globe, LLM chat interface.

**Live:** https://6print.org | **API:** https://api.6print.org

---

## Stack

```
Open-Meteo API (free, no key)
  → AWS EventBridge (every 10 min)
    → AWS Lambda (urllib + boto3, no layers)
      → S3 (my-6-data-lake)
        → Snowflake Task: LOAD_LIVE_AIR_QUALITY (every 11 min)
          → Snowflake Task: REFRESH_CLEAN_AIR_QUALITY (chained)
            → FastAPI backend (Python, Snowflake connector, Groq)
              → React + Vite frontend (Mapbox GL, Recharts, Axios)
                → Users
```

---

## Infrastructure

| What | Where | Details |
|------|-------|---------|
| Frontend | Cloudflare Pages | `6print.org`, auto-deploys on push to `main` |
| Backend | Hetzner VPS `data-suite-01` | Docker container, Nginx reverse proxy |
| API domain | `api.6print.org` | Let's Encrypt SSL via Certbot, DNS-only (grey cloud) |
| CI/CD | GitHub Actions | Builds Docker image → pushes to DockerHub → redeploys on Hetzner |
| Data | Snowflake `carbon_db` | Account: `rciqlzm-vjb70706` |
| Images | DockerHub | `j031nich0145/6print-backend:latest` |

**Hetzner server:**
- IP: `5.78.186.48`
- User: `ubu` (sudo)
- SSH: `ssh -i ~/.ssh/id_ed25519_6print -o IdentitiesOnly=yes ubu@5.78.186.48`
- Alias: `ssh data-suite` (if `~/.ssh/config` is set up)
- Env file: `/opt/6print/.env`

**SSH config alias:**
```
Host data-suite
    HostName 5.78.186.48
    User ubu
    IdentityFile ~/.ssh/id_ed25519_6print
    IdentitiesOnly yes
```

---

## Repo Structure

```
6print/
├── backend/
│   ├── main.py              # FastAPI app — all endpoints
│   ├── requirements.txt     # fastapi, uvicorn, pydantic, python-dotenv,
│   │                        #   snowflake-connector-python, groq
│   └── Dockerfile           # python:3.12-slim, exposes 8000
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Root — axios baseURL, data fetching, region filters
│   │   ├── pages/
│   │   │   ├── AirQuality.jsx      # ~1900 lines, owns shared Mapbox instance
│   │   │   ├── UVIndex.jsx         # Overlay on shared map, UV calculator
│   │   │   ├── CarbonCalculator.jsx # Overlay on shared map, CO + footprint calc
│   │   │   └── QueryChat.jsx       # Full-page streaming LLM chat (fetch, SSE)
│   │   └── components/
│   │       └── KpiCards.jsx        # Draggable cards, colormap-aware
│   ├── .env                 # Local only — gitignored
│   │                        #   VITE_MAPBOX_TOKEN=pk....
│   │                        #   VITE_API_URL=http://localhost:8000
│   ├── vite.config.js       # Standard Vite config, proxy /api → :8000 for local dev
│   └── package.json
├── scripts/
│   ├── build_city_list.py       # Regenerate cities_final.csv from GeoNames
│   ├── load_cities_snowflake.py # Load CSV into Snowflake cities table
│   ├── backfill_historical.py   # One-time historical pull (done, 54k rows)
│   └── ingest.py                # Not used — Lambda handles ingest
├── lambda_function.py       # AWS Lambda source (deployed separately)
├── cities_final.csv         # 1396 cities with lat/lon/region
├── .env                     # Root env — backend secrets (gitignored)
│                            #   SNOWFLAKE_*, GROQ_API_KEY, MAPBOX_TOKEN
├── .github/
│   └── workflows/
│       └── deploy.yml       # CI/CD: build → DockerHub → Hetzner redeploy
└── README.md
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check → `{"status":"ok"}` |
| `/api/aqi` | GET | Latest snapshot per city (params: `region`, `min_pop`) |
| `/api/snapshot` | GET | Historical averages (params: `days`, `year`, `region`) |
| `/api/trend` | GET | Time series for one city (params: `city`, `metric`, `days`) |
| `/api/chat` | POST | Streaming SSE chat (Groq `llama-3.3-70b-versatile`) |

---

## Snowflake

**Account:** `rciqlzm-vjb70706` | **DB:** `carbon_db` | **Warehouse:** `carbon_wh`

```
carbon_db.PUBLIC
  cities                    -- 1396 cities dimension table
  aq_readings               -- fact table (metrics only)
  clean_air_quality         -- VIEW: latest per city
  air_quality_combined      -- VIEW: all history, daily granularity

carbon_db.ANALYTICS
  clean_air_quality         -- live data table (rebuilt by Snowflake task)
  air_quality_historical    -- backfill 2022-08-01 → 2026-05-24

carbon_db.RAW
  raw_air_quality           -- VARIANT, live Lambda JSON
  raw_air_quality_historical -- VARIANT, backfill JSON

Tasks:
  LOAD_LIVE_AIR_QUALITY     -- every 11 min, COPY INTO raw_air_quality
  REFRESH_CLEAN_AIR_QUALITY -- chained, rebuilds analytics table
```

**Data coverage:**
- Historical: 2022-08-01 → 2026-05-24, ~1.9M rows
- Realtime: 2026-05-13 → present, growing every 10 min

---

## AWS

- **Lambda**: Python 3.12, 128MB, 3min timeout, no layers
- **EventBridge**: triggers Lambda every 10 min
- **S3**: `my-6-data-lake`
  - Live: `s3://my-6-data-lake/raw/air_quality/`
  - Historical: `s3://my-6-data-lake/historical/air_quality/daily/`
  - City list: `s3://my-6-data-lake/config/cities_final.csv`

---

## Frontend Notes

- **Single Mapbox instance** in `AirQuality.jsx` — always mounted
- UV and Carbon tabs are transparent overlays on the shared map
- `visibility: hidden` (not `display: none`) preserves WebGL context
- `QueryChat.jsx` uses `fetch()` with SSE — not axios — uses `VITE_API_URL` directly
- All other API calls use `axios` with `axios.defaults.baseURL` set in `App.jsx`
- `VITE_*` prefix required for Vite to expose env vars to the bundle

---

## Local Dev

**Backend venv:**
```bash
cd ~/Documents/BUILD/6print/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd ~/Documents/BUILD/6print/frontend
npm install
npm run dev   # http://localhost:5173
```

**Both at once:**
```bash
# Terminal 1
cd ~/Documents/BUILD/6print/backend && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd ~/Documents/BUILD/6print/frontend && npm run dev
```

**Local URLs:**

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

---

## GitHub Secrets (for CI/CD)

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | `j031nich0145` |
| `DOCKERHUB_TOKEN` | DockerHub access token |
| `HETZNER_HOST` | `5.78.186.48` |
| `HETZNER_USER` | `ubu` |
| `HETZNER_SSH_KEY` | contents of `~/.ssh/id_ed25519_6print` |

---

## Cloudflare Pages Environment Variables

| Variable | Value |
|----------|-------|
| `VITE_MAPBOX_TOKEN` | Mapbox public token (`pk....`) |
| `VITE_API_URL` | `https://api.6print.org` |

---

## Useful Server Commands

```bash
# Check backend
docker ps
docker logs 6print-backend -f

# Manual container update
docker pull j031nich0145/6print-backend:latest && \
  docker stop 6print-backend && \
  docker rm 6print-backend && \
  docker run -d --name 6print-backend --restart always \
    --env-file /opt/6print/.env -p 8000:8000 \
    j031nich0145/6print-backend:latest

# Test API
curl https://api.6print.org/api/health

# Nginx
sudo nginx -t
sudo systemctl reload nginx

# SSL renewal (auto via cron, manual if needed)
sudo certbot renew
```

---

## Known Issues / Future Work

- [ ] Bundle size warning — JS chunk is 2.5MB, consider code splitting
- [ ] Snowflake connection per request — consider connection pooling
- [ ] Disease Dashboard — same architecture, `disease.sh` as data source (see `disease_dash.md`)
- [ ] `www.6print.org` CNAME added — verify it resolves correctly
- [ ] GitHub Actions Node.js 20 deprecation warning — update action versions before June 2026