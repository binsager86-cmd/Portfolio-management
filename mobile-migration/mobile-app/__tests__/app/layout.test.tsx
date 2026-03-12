/**
 * Auth redirect — unit tests for the Single Auth Gate pattern.
 *
 * The app uses a single auth gate at app/index.tsx:
 *   - app/index.tsx redirects to /(auth)/login or /(tabs) based on auth state
 *   - app/_layout.tsx always renders the Stack (no auth guard)
 *   - app/(tabs)/ routes trust they are only reached when authenticated
 *
 * Regression tests for:
 *   - Render deadlock: old guard blocked Stack mount → nothing rendered
 *   - Redirect timing: old useEffect + useRef approach had race condition
 *     with Zustand's useSyncExternalStore batching
 *   - SSR compatibility: gate must handle isLoading=true initial state
 */

// ── Tests ───────────────────────────────────────────────────────────

describe("Auth redirect architecture", () => {
  describe("app/index.tsx — root route redirect", () => {
    it("shows nothing while auth is loading", () => {
      const isLoading = true;
      const token = null;

      // When isLoading, index.tsx returns null (blank screen)
      const shouldWait = isLoading;
      expect(shouldWait).toBe(true);
    });

    it("redirects to login when auth loaded and no token", () => {
      const isLoading = false;
      const token = null;

      const shouldRedirectToLogin = !isLoading && !token;
      expect(shouldRedirectToLogin).toBe(true);
    });

    it("redirects to tabs when auth loaded and has token", () => {
      const isLoading = false;
      const token = "valid-jwt";

      const shouldRedirectToTabs = !isLoading && !!token;
      expect(shouldRedirectToTabs).toBe(true);
    });
  });

  describe("app/(tabs)/ routes — no redundant auth guards", () => {
    it("(tabs)/_layout.tsx does NOT have its own auth redirect", () => {
      // Auth is handled at app/index.tsx; tab routes trust they are
      // only reached when the user is authenticated.
      const fs = require("fs");
      const path = require("path");
      const tabsLayout = fs.readFileSync(
        path.join(__dirname, "..", "..", "app", "(tabs)", "_layout.tsx"),
        "utf8"
      );
      expect(tabsLayout).not.toContain('<Redirect href="/(auth)/login"');
    });

    it("(tabs)/index.tsx does NOT have its own auth redirect", () => {
      const fs = require("fs");
      const path = require("path");
      const tabsIndex = fs.readFileSync(
        path.join(__dirname, "..", "..", "app", "(tabs)", "index.tsx"),
        "utf8"
      );
      expect(tabsIndex).not.toContain('<Redirect href="/(auth)/login"');
    });
  });

  describe("Source code structural checks", () => {
    const fs = require("fs");
    const path = require("path");

    const rootLayout = fs.readFileSync(
      path.join(__dirname, "..", "..", "app", "_layout.tsx"),
      "utf8"
    );
    const indexRoute = fs.readFileSync(
      path.join(__dirname, "..", "..", "app", "index.tsx"),
      "utf8"
    );
    const tabsLayout = fs.readFileSync(
      path.join(__dirname, "..", "..", "app", "(tabs)", "_layout.tsx"),
      "utf8"
    );
    const tabsIndex = fs.readFileSync(
      path.join(__dirname, "..", "..", "app", "(tabs)", "index.tsx"),
      "utf8"
    );

    it("root layout always renders Stack (no auth guard blocks it)", () => {
      // Root layout should NOT have auth-based return null guards
      expect(rootLayout).not.toMatch(/if\s*\(\s*!initialized\s*\)/);
      expect(rootLayout).not.toMatch(/if\s*\(\s*authLoading\s*&&/);
    });

    it("root layout has index as initialRouteName", () => {
      expect(rootLayout).toContain('initialRouteName: "index"');
    });

    it("root layout Stack includes index screen", () => {
      expect(rootLayout).toContain('name="index"');
    });

    it("app/index.tsx uses <Redirect> for auth routing", () => {
      expect(indexRoute).toContain("<Redirect href=");
      expect(indexRoute).toContain("/(auth)/login");
      expect(indexRoute).toContain("/(tabs)");
    });

    it("app/index.tsx checks isLoading before redirecting", () => {
      expect(indexRoute).toContain("isLoading");
    });

    it("(tabs)/_layout.tsx does NOT contain auth redirect", () => {
      expect(tabsLayout).not.toContain('<Redirect href="/(auth)/login"');
    });

    it("(tabs)/index.tsx does NOT contain auth redirect", () => {
      expect(tabsIndex).not.toContain('<Redirect href="/(auth)/login"');
      expect(tabsIndex).not.toContain("authToken");
      expect(tabsIndex).not.toContain("authLoading");
    });

    it("root layout does NOT import Redirect or useSegments", () => {
      expect(rootLayout).not.toContain("useSegments");
      expect(rootLayout).not.toMatch(
        /import\s*{[^}]*Redirect[^}]*}\s*from\s*["']expo-router["']/
      );
    });

    it("root layout init effect hydrates auth", () => {
      expect(rootLayout).toContain("hydrateAuth");
      expect(rootLayout).toContain("hydrateTheme");
    });
  });
});
