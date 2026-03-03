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

// ── Mock react-native-chart-kit ─────────────────────────────────────
jest.mock("react-native-chart-kit", () => ({
  LineChart: "LineChart",
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
