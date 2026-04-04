/**
 * useGoogleSignIn — React hook for Google OAuth on web + native.
 *
 * Web:    Full-page redirect to Google's OAuth consent screen (implicit flow).
 *         Google redirects back with #access_token=... in the URL hash.
 *         _layout.tsx extracts the token on mount and completes sign-in.
 *
 * Native: Uses @react-native-google-signin/google-signin for OS-native
 *         sign-in. Returns a Google id_token.
 *
 * NOTE: On web the `signIn()` call never resolves — it redirects the page.
 *       The login completion is handled by _layout.tsx's hash-detection effect.
 */

import { GOOGLE_WEB_CLIENT_ID } from "@/constants/Config";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

// ── Result type ─────────────────────────────────────────────────────

export type GoogleSignInResult =
  | { success: true; token: string }
  | { success: false; cancelled: boolean; error?: string };

// ── Hook ────────────────────────────────────────────────────────────

export function useGoogleSignIn() {
  const [isLoading, setIsLoading] = useState(false);

  const signIn = useCallback(async (): Promise<GoogleSignInResult> => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      return {
        success: false,
        cancelled: false,
        error: "Google Sign-In not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.",
      };
    }

    setIsLoading(true);
    try {
      if (Platform.OS === "web") {
        signInWebRedirect();
        // This never resolves — the page navigates away.
        // Return a pending-style result just in case:
        return { success: false, cancelled: false, error: "Redirecting to Google…" };
      }
      return await signInNative();
    } catch (err: unknown) {
      console.error("[useGoogleSignIn] Error:", err);
      return {
        success: false,
        cancelled: false,
        error: err instanceof Error ? err.message : "Google Sign-In failed unexpectedly.",
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { signIn, isLoading };
}

// ── Web: full-page redirect (most reliable) ─────────────────────────

function signInWebRedirect(): void {
  // Build the redirect URI from the current origin
  const redirectUri = window.location.origin;

  // Build Google's implicit-flow authorization URL
  const params = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: "openid profile email",
    prompt: "select_account",
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  if (__DEV__) {
    console.log("[useGoogleSignIn] Redirecting to Google OAuth");
    console.log("[useGoogleSignIn] Redirect URI:", redirectUri);
  }

  // Navigate the current page to Google
  window.location.href = url;
}

// ── Native: @react-native-google-signin ─────────────────────────────

async function signInNative(): Promise<GoogleSignInResult> {
  console.log("[useGoogleSignIn] Platform: native");
  const { performNativeGoogleSignIn } = await import("@/lib/googleAuth");
  const result = await performNativeGoogleSignIn();
  if (result.success) {
    return { success: true, token: result.idToken };
  }
  return { success: false, cancelled: result.cancelled, error: result.error };
}
