# 6print — Carbon Monitor

Global real-time air quality analytics platform. 1389 cities, live data every 10 minutes, interactive Mapbox globe, LLM chat interface.

**Live:** https://6print.org | **API:** https://api.6print.org

---

## Stack (current — PostgreSQL)

```
Open-Meteo API (free, no key)
  → Cron job on Hetzner (every 10 min, ingest_postgres.py)
    → PostgreSQL (Docker container, same VPS)
      → FastAPI backend (Python, psycopg2, Groq)
        → React + Vite frontend (Mapbox GL, Recharts, Axios)
          → Users
```

> **Architecture note (for About page / posterity):** This platform was originally
> architected on AWS — `Open-Meteo → EventBridge → Lambda → S3 → Snowflake → FastAPI → React`.
> That pipeline worked well but added unnecessary cost/complexity at this scale
> (~2M rows). It was migrated to a self-hosted PostgreSQL pipeline on Hetzner —
> same VPS already in use, zero added cost, no third-party data warehouse
> dependency. The original Snowflake implementation is preserved as
> `main_snowflake.py` for reference. See `snowflake-to-postgres-migration.md`
> for the full migration writeup.

---

## Infrastructure

| What | Where | Details |
|------|-------|---------|
| Frontend | Cloudflare Pages | `6print.org`, auto-deploys on push to `main` |
| Backend | Hetzner VPS `data-suite-01` | Docker container, Nginx reverse proxy |
| API domain | `api.6print.org` | Let's Encrypt SSL via Certbot, DNS-only (grey cloud) |
| CI/CD | GitHub Actions | Builds Docker image → pushes to DockerHub → redeploys on Hetzner |
| Data | PostgreSQL (Docker, same VPS) | DB: `carbon_db`, container: `6print-postgres` |
| Images | DockerHub | `j031nich0145/6print-backend:latest` |

**Hetzner server:**
- IP: `5.78.186.48`
- User: `ubu` (sudo)
- SSH: `ssh -i ~/.ssh/id_ed25519_6print -o IdentitiesOnly=yes ubu@5.78.186.48`
- Alias: `ssh data-suite` (if `~/.ssh/config` is set up)
- Backend env file: `/opt/6print/.env`
- Postgres data volume: `/opt/postgres-data`

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
│   ├── main.py                # FastAPI app — current (PostgreSQL)
│   ├── main_snowflake.py      # Original Snowflake implementation — kept for reference
│   ├── requirements.txt       # fastapi, uvicorn, pydantic, python-dotenv,
│   │                          #   psycopg2-binary, groq
│   └── Dockerfile             # python:3.12-slim, exposes 8000
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Root — axios baseURL, data fetching, region filters
│   │   ├── pages/
│   │   │   ├── AirQuality.jsx       # ~1900 lines, owns shared Mapbox instance
│   │   │   ├── UVIndex.jsx          # Overlay on shared map, UV calculator
│   │   │   ├── CarbonCalculator.jsx # Overlay on shared map, CO + footprint calc
│   │   │   └── QueryChat.jsx        # Full-page streaming LLM chat (fetch, SSE)
│   │   └── components/
│   │       └── KpiCards.jsx         # Draggable cards, colormap-aware
│   ├── .env                   # Local only — gitignored
│   │                          #   VITE_MAPBOX_TOKEN=pk....
│   │                          #   VITE_API_URL=http://localhost:8000
│   ├── vite.config.js         # Standard Vite config, proxy /api → :8000 for local dev
│   └── package.json
├── scripts/
│   ├── build_city_list.py         # Regenerate cities_final.csv from GeoNames
│   ├── schema.sql                 # PostgreSQL schema — cities, aq_readings, views
│   ├── ingest_postgres.py         # Cron ingestion — replaces Lambda+EventBridge
│   ├── load_cities_snowflake.py   # OLD — kept for reference
│   └── backfill_historical.py     # OLD — one-time Snowflake historical pull
├── lambda_function.py         # OLD — AWS Lambda source, no longer deployed
├── cities_final.csv           # 1396 cities with lat/lon/region
├── .env                       # Root env — backend secrets (gitignored)
│                              #   POSTGRES_*, GROQ_API_KEY, MAPBOX_TOKEN
├── .github/
│   └── workflows/
│       └── deploy.yml         # CI/CD: build → DockerHub → Hetzner redeploy
├── README.md
└── snowflake-to-postgres-migration.md   # Full migration writeup
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

## PostgreSQL

**DB:** `carbon_db` | **Container:** `6print-postgres` | **User:** `sixprint`

```
carbon_db
  cities                -- 1396 cities dimension table
  aq_readings            -- fact table, append-only, 10-min cadence
  clean_air_quality       -- VIEW: latest per city (DISTINCT ON)
  air_quality_combined    -- VIEW: daily averages, all history
```

**Data coverage:**
- Realtime: ongoing, every 10 min via cron (`ingest_postgres.py`)
- Historical: Snowflake data prior to migration may be unrecoverable if not
  exported before trial suspension — see `snowflake-to-postgres-migration.md`
  Step 6 for recovery steps if a CSV export exists.

**Ingestion:** `scripts/ingest_postgres.py` runs via cron every 10 minutes,
fetches Open-Meteo directly per city, writes to `aq_readings`. Replaces the
old AWS Lambda + EventBridge + Snowflake Tasks pipeline entirely.

```bash
# Cron entry on Hetzner
*/10 * * * * cd /opt/6print && /usr/bin/python3 ingest_postgres.py >> /var/log/6print-ingest.log 2>&1
```

---

## Frontend Notes

- **Single Mapbox instance** in `AirQuality.jsx` — always mounted
- UV and Carbon tabs are transparent overlays on the shared map
- `visibility: hidden` (not `display: none`) preserves WebGL context
- `QueryChat.jsx` uses `fetch()` with SSE — not axios — uses `VITE_API_URL` directly
- All other API calls use `axios` with `axios.defaults.baseURL` set in `App.jsx`
- `VITE_*` prefix required for Vite to expose env vars to the bundle
- About page should reflect the architecture note above (AWS → self-hosted Postgres)

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

**Local Postgres connection (for dev):** point `POSTGRES_HOST` at your Hetzner
IP or run a local Postgres container with the same schema loaded from
`scripts/schema.sql`.

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

# Check postgres
docker logs 6print-postgres -f
docker exec -it 6print-postgres psql -U sixprint -d carbon_db

# Manual backend container update
docker pull j031nich0145/6print-backend:latest && \
  docker stop 6print-backend && \
  docker rm 6print-backend && \
  docker run -d --name 6print-backend --restart always \
    --network 6print-net \
    --env-file /opt/6print/.env -p 8000:8000 \
    j031nich0145/6print-backend:latest

# Test API
curl https://api.6print.org/api/health

# Manually run ingestion (outside cron, for testing)
cd /opt/6print && python3 ingest_postgres.py

# Check ingestion logs
tail -f /var/log/6print-ingest.log

# Nginx
sudo nginx -t
sudo systemctl reload nginx

# SSL renewal (auto via cron, manual if needed)
sudo certbot renew
```

---

## Known Issues / Future Work

- [ ] Bundle size warning — JS chunk is 2.5MB, consider code splitting
- [ ] Postgres connection per request — consider connection pooling (e.g. pgbouncer or psycopg2 pool)
- [ ] Historical data prior to Snowflake migration may need recovery/re-backfill
- [ ] Disease Dashboard — same architecture, PostgreSQL from day 1 (see `disease-dashboard-plan.md`)
- [ ] `www.6print.org` CNAME added — verify it resolves correctly
- [ ] About page — add architecture history note (AWS/Snowflake → self-hosted Postgres)
- [ ] UFW firewall currently inactive on Hetzner — consider enabling, only open 80/443