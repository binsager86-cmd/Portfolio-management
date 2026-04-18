/**
 * Jest global setup — mocks for React Native, Expo modules, and testing utilities.
 */

// Silence noisy warnings in test output
jest.spyOn(console, "warn").mockImplementation((...args) => {
  // Only suppress known RN/Expo noise, let real warnings through
  const msg = typeof args[0] === "string" ? args[0] : "";
  if (
    msg.includes("Animated:") ||
    msg.includes("NativeModule") ||
    msg.includes("TurboModule")
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[WARN]", ...args);
});

// ── Mock expo-secure-store ──────────────────────────────────────────
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock expo-font ──────────────────────────────────────────────────
jest.mock("expo-font", () => ({
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
}));

// ── Mock expo-splash-screen ─────────────────────────────────────────
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock @expo/vector-icons ─────────────────────────────────────────
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

// ── Mock expo-router ────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
  Link: "Link",
  Tabs: {
    Screen: "TabsScreen",
  },
}));

// ── Mock react-native-reanimated ────────────────────────────────────
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

// ── Mock AsyncStorage ───────────────────────────────────────────────
jest.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

// ── Mock react-i18next ──────────────────────────────────────────────
jest.mock("react-i18next", () => {
  const en = require("./lib/i18n/translations/en.json");
  function t(key, params) {
    const parts = key.split(".");
    let val = en;
    for (const p of parts) {
      if (val == null) break;
      val = val[p];
    }
    if (typeof val !== "string") return key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        val = val.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      });
    }
    return val;
  }
  return {
    useTranslation: () => ({ t, i18n: { language: "en", changeLanguage: jest.fn() } }),
    Trans: ({ children }) => children,
    initReactI18next: { type: "3rdParty", init: jest.fn() },
  };
});

// ── Mock react-native-safe-area-context ─────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
}));

// (expo streams compat handled via jest.config.js moduleNameMapper)
