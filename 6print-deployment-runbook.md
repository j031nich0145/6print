# 6print — Deployment Runbook
> Full stack: React (Cloudflare Pages) → FastAPI (Hetzner VPS) → Snowflake + Groq

---

## Stack Overview

```
React + Vite frontend
  → Cloudflare Pages (6print.org)
    → FastAPI backend (api.6print.org)
      → Nginx reverse proxy
        → Docker container (Hetzner VPS)
          → Snowflake (data) + Groq (LLM)
```

---

## Prerequisites

- DockerHub account with repo `yourusername/6print-backend`
- GitHub repo with the project
- Hetzner account
- Cloudflare account with domain registered

---

## Part 1 — Local SSH Key Setup

Generate a dedicated deploy key (no passphrase — needed for GitHub Actions unattended deploy):

```bash
ssh-keygen -t ed25519 -C "6print-deploy" -f ~/.ssh/id_ed25519_6print
```

Add to `~/.ssh/config`:

```
Host data-suite
    HostName YOUR_SERVER_IP
    User ubu
    IdentityFile ~/.ssh/id_ed25519_6print
    IdentitiesOnly yes

Host data-suite-root
    HostName YOUR_SERVER_IP
    User root
    IdentityFile ~/.ssh/id_ed25519_6print
    IdentitiesOnly yes
```

---

## Part 2 — Hetzner VPS Setup

### 2.1 Create Server

1. Hetzner Console → New Server
2. **Image**: Ubuntu 24.04
3. **Type**: CPX11 (2 vCPU, 2GB RAM)
4. **SSH Keys**: paste contents of `~/.ssh/id_ed25519_6print.pub`
5. **IPv4**: enabled
6. **Backups**: optional
7. Note the server IP

### 2.2 Initial SSH + User Setup

```bash
# Clear old host key if reusing IP
ssh-keygen -f '~/.ssh/known_hosts' -R 'YOUR_SERVER_IP'

# SSH in as root
ssh -i ~/.ssh/id_ed25519_6print -o IdentitiesOnly=yes root@YOUR_SERVER_IP

# Create ubu user
useradd -m -s /bin/bash -G sudo ubu

# Copy SSH key to ubu
mkdir -p /home/ubu/.ssh && \
cp /root/.ssh/authorized_keys /home/ubu/.ssh/authorized_keys && \
chown -R ubu:ubu /home/ubu/.ssh && \
chmod 700 /home/ubu/.ssh && \
chmod 600 /home/ubu/.ssh/authorized_keys

# Set a password for ubu (needed for sudo)
passwd ubu
```

Test ubu login in a new terminal before continuing:

```bash
ssh data-suite
```

### 2.3 Harden SSH

```bash
# Run as root
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

### 2.4 Install Docker

```bash
apt update && apt install -y ca-certificates curl && \
install -m 0755 -d /etc/apt/keyrings && \
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
chmod a+r /etc/apt/keyrings/docker.asc && \
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
tee /etc/apt/sources.list.d/docker.list && \
apt update && apt install -y docker-ce docker-ce-cli containerd.io

# Add ubu to docker group
usermod -aG docker ubu

# Verify
docker run hello-world
```

### 2.5 Install Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

### 2.6 Create Env File

```bash
mkdir -p /opt/6print
nano /opt/6print/.env
```

Contents:

```bash
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USER=your_user
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_DATABASE=carbon_db
SNOWFLAKE_WAREHOUSE=carbon_wh
SNOWFLAKE_SCHEMA=PUBLIC
GROQ_API_KEY=gsk_...
```

### 2.7 Run Backend Container

```bash
docker run -d \
  --name 6print-backend \
  --restart always \
  --env-file /opt/6print/.env \
  -p 8000:8000 \
  yourusername/6print-backend:latest
```

Verify:

```bash
docker ps
docker logs 6print-backend
```

### 2.8 Configure Nginx

Remove the default site and create the 6print config:

```bash
rm /etc/nginx/sites-enabled/default

nano /etc/nginx/sites-available/6print
```

Paste:

```nginx
server {
    listen 80;
    server_name 6print.org api.6print.org;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/6print /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Verify:

```bash
curl http://localhost/api/health
# → {"status":"ok"}
```

---

## Part 3 — DNS (Cloudflare)

Go to Cloudflare → your domain → DNS → Records. Add:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `api` | `YOUR_SERVER_IP` | DNS only (grey cloud) |
| CNAME | `@` | `6print.pages.dev` | Proxied |
| CNAME | `www` | `6print.pages.dev` | Proxied |

> **Note:** `api` must be DNS only (grey cloud) so Certbot can issue an SSL cert directly.

---

## Part 4 — SSL Certificate for API

```bash
ssh data-suite
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.6print.org
```

Certbot auto-configures Nginx for HTTPS and sets up auto-renewal.

Verify:

```bash
curl https://api.6print.org/api/health
# → {"status":"ok"}
```

---

## Part 5 — GitHub Actions CI/CD

### 5.1 DockerHub Token

1. DockerHub → Account Settings → Security → New Access Token
2. Name: `6print`, Permission: **Read & Write**
3. Copy the token

### 5.2 GitHub Secrets

Go to GitHub repo → Settings → Secrets and variables → Actions. Add:

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | your DockerHub username |
| `DOCKERHUB_TOKEN` | DockerHub access token |
| `HETZNER_HOST` | your VPS IP |
| `HETZNER_USER` | `ubu` |
| `HETZNER_SSH_KEY` | contents of `~/.ssh/id_ed25519_6print` (entire file including header/footer) |

### 5.3 Workflow File

Create `.github/workflows/deploy.yml`:

```yaml
name: Build & Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build & push backend image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/6print-backend:latest

      - name: Deploy to Hetzner
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            docker pull yourusername/6print-backend:latest
            docker stop 6print-backend || true
            docker rm 6print-backend || true
            docker run -d \
              --name 6print-backend \
              --restart always \
              --env-file /opt/6print/.env \
              -p 8000:8000 \
              yourusername/6print-backend:latest
            docker image prune -f
```

Commit and push to trigger first deploy:

```bash
git add .github/workflows/deploy.yml
git commit -m "add CI/CD deploy workflow"
git push origin main
```

Check Actions tab: `https://github.com/yourusername/6print/actions`

---

## Part 6 — Frontend (Cloudflare Pages)

### 6.1 Vite Config

`frontend/vite.config.js` must NOT load env from a parent directory. Use standard Vite env loading:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

### 6.2 Axios Base URL

In `frontend/src/App.jsx`, add immediately after `import axios from "axios"`:

```js
axios.defaults.baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";
```

Any `fetch()` calls (e.g. in `QueryChat.jsx`) must use the env var explicitly:

```js
const res = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, { ... });
```

### 6.3 Local Env File

Create `frontend/.env` (gitignored):

```bash
VITE_MAPBOX_TOKEN=pk.your_token_here
VITE_API_URL=http://localhost:8000
```

### 6.4 Cloudflare Pages Setup

1. Cloudflare → Workers & Pages → **"Looking to deploy Pages? Get started"**
2. Connect GitHub repo
3. Build settings:
   - **Framework preset**: React (Vite)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory** (Advanced): `frontend`
4. Environment variables:
   - `VITE_MAPBOX_TOKEN` = your Mapbox token
   - `VITE_API_URL` = `https://api.6print.org`
5. Deploy

### 6.5 Custom Domain

Pages → Custom domains → Add `6print.org`

Cloudflare auto-verifies since domain is already on Cloudflare.

---

## Part 7 — CORS

`backend/main.py` — lock down after domain is confirmed:

```python
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
```

Commit and push — GitHub Actions redeploys backend automatically.

---

## Useful Commands

```bash
# SSH into server
ssh data-suite

# Check backend container
docker ps
docker logs 6print-backend
docker logs 6print-backend -f

# Manually update container
docker pull yourusername/6print-backend:latest && \
docker stop 6print-backend && \
docker rm 6print-backend && \
docker run -d --name 6print-backend --restart always \
  --env-file /opt/6print/.env -p 8000:8000 \
  yourusername/6print-backend:latest

# Test backend locally on server
curl http://localhost/api/health
curl https://api.6print.org/api/health

# Check Nginx
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx

# Renew SSL (auto via cron, but manual if needed)
sudo certbot renew
```

---

## Adding a New Project to the Same Server

1. Add a new Nginx server block in `/etc/nginx/sites-available/` for the new subdomain
2. Create `/opt/newproject/.env` with its env vars
3. Run the new Docker container on a different port (e.g. `8001`)
4. Run Certbot for the new subdomain
5. Create a new Cloudflare Pages project for the frontend
6. Add a new GitHub Actions workflow or extend the existing one

---

## What Auto-Deploys on `git push origin main`

| What | How |
|------|-----|
| Backend Docker image | GitHub Actions builds + pushes to DockerHub + restarts container on Hetzner |
| Frontend | Cloudflare Pages detects push and rebuilds from `frontend/` |
