/**
 * Cross-platform Google Sign-In helper.
 *
 * - **Web:** Uses `expo-auth-session` with `AuthRequest` (implicit flow,
 *   `response_type=token`). Returns a Google **access_token** which the
 *   backend verifies via the `/oauth2/v3/userinfo` endpoint.
 *
 * - **Native (iOS/Android):** Uses `@react-native-google-signin/google-signin`
 *   for an OS-native sign-in experience and returns a Google **id_token**.
 *
 * IMPORTANT: `WebBrowser.maybeCompleteAuthSession()` is called at module
 * level in `app/_layout.tsx`. This is required for the OAuth popup to
 * properly relay the token back to the parent window on web.
 */

import { Platform } from "react-native";
import { GOOGLE_WEB_CLIENT_ID } from "@/constants/Config";

// ── Types ───────────────────────────────────────────────────────────

export type GoogleAuthResult =
  | { success: true; idToken: string }
  | { success: false; cancelled: boolean; error?: string };

// ── Standalone entry point (used in register.tsx / login.tsx) ────────

/**
 * Perform Google Sign-In on the current platform.
 *
 * Returns a `GoogleAuthResult`:
 *   - On web  → `{ success: true, idToken: <access_token> }`
 *   - Native  → `{ success: true, idToken: <id_token> }`
 *   - Failure → `{ success: false, cancelled, error }`
 */
export async function performGoogleSignIn(): Promise<GoogleAuthResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    if (__DEV__) console.error("[GoogleAuth] GOOGLE_WEB_CLIENT_ID is empty!");
    return {
      success: false,
      cancelled: false,
      error: "Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.",
    };
  }

  if (__DEV__) console.log("[GoogleAuth] Starting sign-in on platform:", Platform.OS);

  if (Platform.OS === "web") {
    return performWebGoogleSignIn();
  }
  return performNativeGoogleSignIn();
}

// ── Web: implicit flow via expo-auth-session ────────────────────────

async function performWebGoogleSignIn(): Promise<GoogleAuthResult> {
  try {
    const AuthSession = await import("expo-auth-session");

    // Google OAuth 2.0 endpoints
    const discovery: AuthSession.DiscoveryDocument = {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
    };

    // ✅ Dynamic redirect URI — adapts to whatever port Expo picks
    // On web this uses the current origin (e.g. http://localhost:8081)
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "portfolio-tracker",
      preferLocalhost: true,
    });

    if (__DEV__) {
      console.log("[GoogleAuth] Redirect URI:", redirectUri);
    }

    const request = new AuthSession.AuthRequest({
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ["openid", "profile", "email"],
      responseType: AuthSession.ResponseType.Token, // implicit flow
      redirectUri,
      usePKCE: false, // implicit flow doesn't use PKCE
    });

    // Open the Google consent screen in a popup
    if (__DEV__) console.log("[GoogleAuth] Opening Google consent screen…");
    const result = await request.promptAsync(discovery);

    if (__DEV__) console.log("[GoogleAuth] Auth result type:", result.type);

    if (result.type === "cancel" || result.type === "dismiss") {
      if (__DEV__) console.log("[GoogleAuth] User cancelled/dismissed the consent screen");
      return { success: false, cancelled: true };
    }

    if (result.type === "success") {
      const accessToken = result.params?.access_token;
      if (!accessToken) {
        if (__DEV__) console.error("[GoogleAuth] ❌ No access_token in response params");
        return {
          success: false,
          cancelled: false,
          error: "Google did not return an access token.",
        };
      }
      if (__DEV__) console.log("[GoogleAuth] ✅ Got access_token");
      // We return it as `idToken` for backward compatibility with the
      // auth store which calls `apiGoogleSignIn(idToken)`. The backend
      // accepts both real ID tokens and access tokens.
      return { success: true, idToken: accessToken };
    }

    // Handle error responses (e.g., access_denied, server_error)
    if (result.type === "error") {
      const errorCode = result.params?.error || "unknown_error";
      const errorDesc = result.params?.error_description || "Google Sign-In returned an error.";
      if (__DEV__) console.error("[GoogleAuth] ❌ Error response:", errorCode);
      return {
        success: false,
        cancelled: false,
        error: `${errorCode}: ${errorDesc}`,
      };
    }

    if (__DEV__) console.warn("[GoogleAuth] ⚠️ Unexpected result type:", result.type);
    return {
      success: false,
      cancelled: false,
      error: `Google Sign-In returned unexpected result: ${result.type}`,
    };
  } catch (err: any) {
    if (__DEV__) console.error("[GoogleAuth Web] ❌ Exception:", err);
    return {
      success: false,
      cancelled: false,
      error: err?.message || "Google Sign-In failed unexpectedly.",
    };
  }
}

// ── Native: @react-native-google-signin ─────────────────────────────

export async function performNativeGoogleSignIn(): Promise<GoogleAuthResult> {
  try {
    const { GoogleSignin } = await import(
      "@react-native-google-signin/google-signin"
    );

    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: true,
    });

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      return {
        success: false,
        cancelled: false,
        error: "Google Sign-In did not return an ID token.",
      };
    }

    if (__DEV__) console.log("[GoogleAuth Native] ✅ Got id_token");
    return { success: true, idToken };
  } catch (err: any) {
    if (err?.code === "SIGN_IN_CANCELLED") {
      return { success: false, cancelled: true };
    }
    if (__DEV__) console.error("[GoogleAuth Native] ❌ Error:", err);
    return {
      success: false,
      cancelled: false,
      error: err?.message || "Google Sign-In failed on this device.",
    };
  }
}
