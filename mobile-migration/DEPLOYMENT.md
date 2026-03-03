# Deployment Guide — Portfolio Mobile App

> **Last updated:** February 2026

This guide covers deploying the **FastAPI backend** and **Expo React Native frontend** to production.

---

## Architecture Overview

```
┌─────────────────┐        HTTPS        ┌──────────────────┐
│  Vercel (Web)    │ ──────────────────► │  Render/Railway  │
│  Expo static     │                     │  FastAPI + SQLite │
└─────────────────┘                     │  or PostgreSQL    │
                                         └──────────────────┘
┌─────────────────┐        HTTPS              ▲
│  Mobile App      │ ─────────────────────────┘
│  iOS / Android   │
└─────────────────┘
```

---

## STEP 1: Backend Hosting (Render)

### Option A — Deploy via Render Blueprint (Recommended)

1. **Push to GitHub** — push the `mobile-migration/backend-api/` folder to a GitHub repo.

2. **Create a Render service:**
   - Go to [https://dashboard.render.com](https://dashboard.render.com)
   - Click **New → Blueprint**
   - Connect your GitHub repo
   - Render detects `render.yaml` and provisions the service automatically
   - `SECRET_KEY` and `CRON_SECRET_KEY` are auto-generated

3. **Upload your database:**
   - After the first deploy, open the service's **Shell** tab
   - Upload your `portfolio.db` file to `/data/portfolio.db`:
     ```bash
     # From your local machine:
     scp portfolio.db render-user@your-service:/data/portfolio.db
     # Or use Render's Shell to download it:
     curl -o /data/portfolio.db https://your-file-host.com/portfolio.db
     ```

4. **Update CORS_ORIGINS** in the Render dashboard → Environment tab:
   ```
   CORS_ORIGINS=https://your-actual-app.vercel.app
   ```

### Option B — Deploy via Docker (Any Host)

```bash
cd mobile-migration/backend-api

# Build the image
docker build -t portfolio-api .

# Run locally to test
docker run -p 8000:8000 --env-file .env.production -v ./data:/data portfolio-api

# Push to your registry
docker tag portfolio-api your-registry/portfolio-api:latest
docker push your-registry/portfolio-api:latest
```

### Option C — Deploy to Railway

1. Go to [https://railway.app](https://railway.app) → **New Project → Deploy from GitHub**
2. Set the **Root Directory** to `mobile-migration/backend-api`
3. Railway auto-detects the Dockerfile
4. Add environment variables in **Variables** tab (copy from `.env.production`)
5. Railway provides a volume for `/data` — add a **Volume** mount at `/data`

### Setting Environment Variables

On **Render**: Dashboard → Your Service → **Environment** tab
On **Railway**: Dashboard → Your Service → **Variables** tab

| Variable | Required | How to Generate |
|----------|----------|------------------|
| `ENVIRONMENT` | Yes | Set to `production` |
| `SECRET_KEY` | Yes | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_PATH` | Yes | `/data/portfolio.db` (Render disk) |
| `CORS_ORIGINS` | Yes | Your Vercel URL, e.g. `https://portfolio-tracker.vercel.app` |
| `CRON_SECRET_KEY` | Yes | `python -c "import secrets; print(secrets.token_hex(16))"` |
| `JWT_ALGORITHM` | No | `HS256` (default) |
| `JWT_EXPIRE_MINUTES` | No | `1440` (default, 24 hours) |
| `PRICE_UPDATE_ENABLED` | No | `true` (default) |
| `PRICE_UPDATE_HOUR` | No | `14` (UTC = 17:00 Kuwait) |
| `FX_CACHE_TTL` | No | `3600` (default) |
| `GEMINI_API_KEY` | No | Get from [Google AI Studio](https://aistudio.google.com/apikey) |

### ⚠️ SQLite Persistence Warning

> **SQLite on cloud hosts is fragile.** Render's free tier spins down after 15 min of inactivity and *may lose data on redeploys* unless you use a **Render Disk** (`/data` mount in `render.yaml`).
>
> **For serious production use, switch to PostgreSQL:**
> - Render: Add a **PostgreSQL** service (free tier: 1 GB, 90 days)
> - Railway: Add a **Postgres** plugin (free tier: 1 GB)
> - Then set `DATABASE_URL=postgresql://user:pass@host:5432/portfolio` and update `database.py` to use SQLAlchemy/asyncpg instead of raw SQLite.
>
> For a personal portfolio tracker with 1 user, **SQLite + Render Disk is fine** — just keep local backups.

### Verify Backend is Live

```bash
curl https://your-backend.onrender.com/health
# → {"status":"ok","db_exists":true,...}

curl -X POST https://your-backend.onrender.com/api/auth/login/json \
  -H "Content-Type: application/json" \
  -d '{"username":"sager alsager","password":"123456"}'
# → {"access_token":"eyJ...","token_type":"bearer",...}
```

---

## STEP 2: Frontend Web Hosting (Vercel)

### 2a. Update the API URL

Before building, set the production API URL. You have two options:

**Option 1 — Vercel Environment Variable (recommended):**
No code changes needed. Set `EXPO_PUBLIC_API_URL` in Vercel dashboard.

**Option 2 — Hardcode (not recommended):**
Edit `constants/Config.ts` and change the fallback URLs.

### 2b. Build the Static Web Bundle

```bash
cd mobile-migration/mobile-app

# Install dependencies (if not done)
npm install

# Export static web build
npx expo export --platform web
```

This creates a `dist/` folder with your static site.

### 2c. Deploy to Vercel

**Option A — Vercel CLI (fastest):**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from the mobile-app directory (vercel.json is already configured)
cd mobile-migration/mobile-app
vercel

# Follow prompts:
#   - Link to existing project? → No, create new
#   - Project name → portfolio-tracker
#   - Framework → Other
#   - Build command → npx expo export --platform web
#   - Output directory → dist
#   - Deploy? → Yes

# Set the API URL environment variable:
vercel env add EXPO_PUBLIC_API_URL production
# Paste: https://your-backend.onrender.com

# Redeploy to pick up the env var:
vercel --prod
```

**Option B — Vercel Dashboard (GUI):**

1. Go to [https://vercel.com](https://vercel.com) → **Add New → Project**
2. Import your GitHub repo
3. Set **Root Directory** to `mobile-migration/mobile-app`
4. Vercel detects `vercel.json` automatically:
   - Build command: `npx expo export --platform web`
   - Output: `dist`
5. Add Environment Variable:
   - Key: `EXPO_PUBLIC_API_URL`
   - Value: `https://your-backend.onrender.com`
6. Click **Deploy**

**Option C — Manual Upload:**

1. Run `npx expo export --platform web` locally
2. Go to [https://vercel.com](https://vercel.com) → **Add New → Project**
3. Drag and drop the `dist/` folder

### 2d. The `vercel.json` (already configured)

```json
{
  "buildCommand": "npx expo export --platform web",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The `rewrites` rule ensures client-side routing works (all paths serve `index.html`).

### Verify Web App is Live

1. Open `https://your-app.vercel.app`
2. You should see the login screen
3. Log in with your credentials
4. Portfolio data should load from the Render backend

---

## STEP 3: Mobile Build (EAS)

### 3a. Prerequisites

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Log in to your Expo account
eas login
```

### 3b. Configure `app.json`

Update these fields in `mobile-migration/mobile-app/app.json`:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR_ACTUAL_EAS_PROJECT_ID"  ← get from `eas init`
      }
    },
    "owner": "your-expo-username"                   ← your Expo account name
  }
}
```

Run `eas init` to auto-generate the project ID:

```bash
cd mobile-migration/mobile-app
eas init
```

### 3c. Update API URL in `eas.json`

Edit `eas.json` and replace `YOUR-BACKEND` with your actual Render URL:

```json
{
  "build": {
    "preview": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://portfolio-api.onrender.com"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://portfolio-api.onrender.com"
      }
    }
  }
}
```

### 3d. Build Android APK (for testing)

```bash
cd mobile-migration/mobile-app

# Build a preview APK (installable, no Play Store needed)
eas build --platform android --profile preview

# EAS will:
#   1. Upload your code to Expo's cloud builders
#   2. Build an .apk file (~3-5 minutes)
#   3. Give you a download URL

# Download and install on your Android device
```

The `preview` profile in `eas.json` is configured with `"buildType": "apk"` — this produces a directly-installable `.apk` file instead of an `.aab` (which requires Play Store).

### 3e. Build Android AAB (for Play Store)

```bash
# Production build (creates .aab for Google Play)
eas build --platform android --profile production
```

To submit to Google Play:
```bash
eas submit --platform android --profile production
```
You'll need a [Google Play Developer account](https://play.google.com/console) ($25 one-time fee) and a `google-services.json` service account key.

### 3f. Build iOS

> **⚠️ Apple Developer Account Required**
>
> iOS builds and App Store submission **require an Apple Developer Program membership** at **$99/year**.
> Sign up at: [https://developer.apple.com/programs/](https://developer.apple.com/programs/)
>
> You also need a Mac for certain signing/provisioning steps, though EAS handles most of it in the cloud.

```bash
# Build for iOS
eas build --platform ios --profile production

# EAS will prompt for:
#   - Apple ID
#   - App Store Connect team
#   - Provisioning profile (EAS can auto-manage this)
```

Update `eas.json` → `submit.production.ios` with your Apple credentials:
```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCDE12345"
      }
    }
  }
}
```

To submit to the App Store:
```bash
eas submit --platform ios --profile production
```

---

## Quick Reference — Deploy Checklist

### First-time Deploy

- [ ] Push code to GitHub
- [ ] **Backend:** Create Render service from Blueprint (or Docker)
- [ ] **Backend:** Verify `/health` returns OK
- [ ] **Backend:** Upload `portfolio.db` to `/data/`
- [ ] **Backend:** Note down the Render URL (e.g., `https://portfolio-api.onrender.com`)
- [ ] **Frontend:** Set `EXPO_PUBLIC_API_URL` on Vercel to the Render URL
- [ ] **Frontend:** Deploy to Vercel
- [ ] **Frontend:** Update `CORS_ORIGINS` on Render to the Vercel URL
- [ ] **Frontend:** Verify web app can log in and show portfolio data
- [ ] **Mobile:** Run `eas init` to get project ID
- [ ] **Mobile:** Update `EXPO_PUBLIC_API_URL` in `eas.json` preview/production profiles
- [ ] **Mobile:** Run `eas build --platform android --profile preview` for test APK

### Subsequent Deploys

```bash
# Backend: push to main branch → Render auto-redeploys
git push origin main

# Frontend: push to main branch → Vercel auto-redeploys
git push origin main

# Mobile: rebuild when native code changes
eas build --platform android --profile preview
```

---

## Cost Summary

| Service | Free Tier | Paid |
|---------|-----------|------|
| **Render** (backend) | Free — spins down after 15 min idle | Starter: $7/month |
| **Render PostgreSQL** | Free 1 GB / 90 days | $7/month |
| **Vercel** (web frontend) | Free — 100 GB bandwidth | Pro: $20/month |
| **EAS Build** (mobile) | 30 builds/month free | $0+ |
| **Google Play** | $25 one-time | — |
| **Apple Developer** | — | $99/year |

For a personal portfolio tracker: **$0/month** (free tiers) + $25 one-time (Android) + $99/yr (iOS, optional).
