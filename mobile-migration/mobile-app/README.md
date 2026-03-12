# Portfolio Tracker — Mobile App

React Native / Expo app for the Portfolio Tracker platform.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and fill in values
cp .env.example .env

# 3. Start the dev server (web)
npx expo start --web --clear

# 4. Start the dev server (native via Expo Go)
npx expo start --clear
```

## Environment Variables

Environment variables prefixed with `EXPO_PUBLIC_` are embedded at **build time** — you must restart/rebuild after changing them.

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | No | Backend API URL. Falls back to `localhost:8002` (dev) or production URL |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Yes | Google OAuth Web Client ID |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Native | Google OAuth iOS Client ID |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Native | Google OAuth Android Client ID |

### Per-environment files

| File | Loaded when |
|------|-------------|
| `.env` | Always (base) |
| `.env.development` | `npx expo start` |
| `.env.production` | `npx expo export` / `eas build` |

## Google OAuth Setup

See [GOOGLE_AUTH_SETUP.md](./GOOGLE_AUTH_SETUP.md) for complete instructions.

**Quick checklist:**
1. Create a Web OAuth client at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add redirect URIs: `http://localhost:8081`, `http://localhost:8082`, and your production domain
3. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env`
4. Restart dev server with `--clear` flag

## Deployment

### DigitalOcean App Platform (Static Site)

Configuration is in [.do/app.yaml](.do/app.yaml).

```bash
# Build command (runs on DO)
npm install --ignore-scripts && npx expo export --platform web

# Output directory
dist/
```

**Required env vars in DO dashboard:**
- `EXPO_PUBLIC_API_URL` → your backend URL
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` → your Google Client ID

### EAS Build (Native)

```bash
# Set secrets (embedded at build time)
eas secret:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "your-client-id"
eas secret:create --name EXPO_PUBLIC_API_URL --value "https://your-backend.com"

# Build
eas build --platform ios --profile production
eas build --platform android --profile production
```

### Important: Rebuild After Env Changes

Expo embeds `EXPO_PUBLIC_*` variables at build time. After changing any env var:

- **Local dev:** restart with `npx expo start --clear`
- **EAS:** trigger a new build
- **DigitalOcean:** redeploy the app

## Project Structure

```
app/
  (auth)/          — Login, Register screens
  (tabs)/          — Main app tabs (after auth)
  _layout.tsx      — Root layout with auth guard
constants/
  Config.ts        — API URL, Google Client ID
hooks/
  useResponsive.ts — Responsive layout hook
lib/
  googleAuth.ts    — Cross-platform Google Sign-In
  validationSchemas.ts — Zod schemas for forms
  analytics.ts     — Lightweight event logging
  env.ts           — Env var validation
services/
  authStore.ts     — Zustand auth state (JWT, Google)
  api.ts           — Axios HTTP client
  tokenStorage.ts  — Secure token persistence
  authErrors.ts    — Error code mapping
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run web` | Start web dev server |
| `npm run build:web` | Export static web build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm test` | Run tests |
