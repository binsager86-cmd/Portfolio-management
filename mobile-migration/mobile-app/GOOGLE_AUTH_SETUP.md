# Google OAuth Setup Guide — Portfolio Mobile App

## 1. Create OAuth Client ID

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your project (or create one)
3. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
4. Application type: **Web application**
5. Name: `Portfolio Tracker Web`

## 2. Configure Authorized JavaScript Origins

Add these **exact** URIs (no trailing slash, no path):

| Origin | Purpose |
|--------|---------|
| `http://localhost:8081` | Expo dev server (default port) |
| `http://localhost:8082` | Expo dev server (fallback port) |
| `http://localhost:19006` | Expo dev server (legacy port) |
| `https://portfolioproapp.com` | Production domain |

## 3. Configure Authorized Redirect URIs

Add these **exact** URIs:

| Redirect URI | Purpose |
|--------------|---------|
| `http://localhost:8081` | Local dev (Expo web) |
| `http://localhost:8082` | Local dev (Expo web, alt port) |
| `http://localhost:19006` | Local dev (Expo web, legacy port) |
| `https://portfolioproapp.com` | Production |
| `https://portfolioproapp.com/auth/callback` | Production callback |
| `https://auth.expo.io/@YOUR_USERNAME/portfolio-tracker` | Expo Go (if using managed workflow) |

> **IMPORTANT:** The redirect URI must **exactly** match what `makeRedirectUri()` generates.
> Open the browser console and look for the log: `[GoogleAuth] Redirect URI: ...`
> That exact string must be in the list above.

## 4. Set Environment Variables

Copy `.env.example` to `.env` and fill in your Client ID:

```bash
cp .env.example .env
```

```dotenv
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=549902495569-6kbc...apps.googleusercontent.com
```

### Per-environment files

| File | Used when |
|------|-----------|
| `.env` | Default (always loaded) |
| `.env.development` | `expo start` (local dev) |
| `.env.production` | `expo build` / `eas build` / deployed |

## 5. For EAS Builds (Native)

```bash
eas secret:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "your-client-id"
eas secret:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "your-ios-client-id"
eas secret:create --name EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID --value "your-android-client-id"
```

## 6. For Native (iOS/Android) — Additional Setup

### iOS
1. Create a **iOS** OAuth client in Google Console
2. Download `GoogleService-Info.plist`
3. Set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `.env`

### Android
1. Create an **Android** OAuth client in Google Console
2. Add your SHA-1 fingerprint: `eas credentials -p android`
3. Set `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` in `.env`

## 7. Verify Setup

1. Start the dev server: `npx expo start --web --clear`
2. Open the browser console
3. Click **Continue with Google**
4. Check the console for:
   ```
   [GoogleAuth] Redirect URI: http://localhost:8081
   [GoogleAuth] ✅ Got access_token (length: ...)
   ```
5. If you see `redirect_uri_mismatch`, the URI logged does NOT match Google Console — add it.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Add the exact URI from console logs to Google Console redirect URIs |
| `invalid_request` with `code_challenge_method` | Ensure `usePKCE: false` in AuthRequest |
| `invalid_request` with `nonce` | Remove `extraParams` containing nonce |
| Port changes (8081 → 8082) | Add ALL possible ports to Google Console, or kill the process using 8081 first |
| `GOOGLE_WEB_CLIENT_ID is empty` | Check `.env` file exists and has the variable set |

## Architecture

```
register.tsx  →  performGoogleSignIn()  →  Web: expo-auth-session (implicit flow)
                                         →  Native: @react-native-google-signin
                     ↓
              authStore.googleSignIn(token)
                     ↓
              POST /auth/google  →  Backend verifies token with Google
                     ↓
              JWT access + refresh tokens returned
```
