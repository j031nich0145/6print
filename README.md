# 6print

# Carbon Monitor — Quick Start

## Backend

```bash
cd ~/Documents/BUILD/6print/backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend

```bash
cd ~/Documents/BUILD/6print/frontend
npm run dev
```

---

## URLs

| Service  | URL                         |
|----------|-----------------------------|
| Frontend | http://localhost:5173        |
| Backend  | http://localhost:8000        |
| API docs | http://localhost:8000/docs   |

---

## First time setup

**Backend venv (if not created yet):**
```bash
cd ~/Documents/BUILD/6print/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Frontend deps (if not installed yet):**
```bash
cd ~/Documents/BUILD/6print/frontend
npm install
npm install html2canvas   # for PNG export
```

**Environment — `.env` lives at project root (`~/Documents/BUILD/6print/.env`):**
```
MAPBOX_TOKEN=pk....
SNOWFLAKE_ACCOUNT=...
SNOWFLAKE_USER=...
SNOWFLAKE_PASSWORD=...
SNOWFLAKE_DATABASE=carbon_db
SNOWFLAKE_WAREHOUSE=carbon_wh
SNOWFLAKE_SCHEMA=PUBLIC
GROQ_API_KEY=gsk_...
```

---

## Both at once (split terminal)

```bash
# Terminal 1 — backend
cd ~/Documents/BUILD/6print/backend && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — frontend
cd ~/Documents/BUILD/6print/frontend && npm run dev
```