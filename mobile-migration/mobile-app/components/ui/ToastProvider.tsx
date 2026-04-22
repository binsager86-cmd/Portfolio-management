/**
 * ToastProvider — Non-blocking toast notifications.
 *
 * Replaces Alert.alert for success/info messages with an animated
 * slide-down toast that auto-dismisses after a configurable duration.
 * Confirmation dialogs (delete, destructive actions) should still use Alert.alert.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success("Transaction added!");
 *   toast.error("Upload failed");
 */
import React, {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
} from "react";
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { Motion } from "@/constants/motion";
import { useThemeStore } from "@/services/themeStore";

// ── Types ───────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (text: string, variant: ToastVariant) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ── Constants ───────────────────────────────────────────────────────

const TOAST_DURATION_MS = 3000;
const SLIDE_MS = Motion.duration.entrance;

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: string; bgDark: string; bgLight: string }
> = {
  success: { icon: "✓", bgDark: "#065f46", bgLight: "#d1fae5" },
  error: { icon: "✕", bgDark: "#7f1d1d", bgLight: "#fee2e2" },
  info: { icon: "ℹ", bgDark: "#1e3a5f", bgLight: "#dbeafe" },
};

const TEXT_COLORS: Record<ToastVariant, { dark: string; light: string }> = {
  success: { dark: "#a7f3d0", light: "#065f46" },
  error: { dark: "#fecaca", light: "#7f1d1d" },
  info: { dark: "#bfdbfe", light: "#1e3a5f" },
};

// ── Toast Item ──────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  const { colors } = useThemeStore();
  const isDark = colors.mode === "dark";
  const cfg = VARIANT_CONFIG[toast.variant];
  const textColor = isDark
    ? TEXT_COLORS[toast.variant].dark
    : TEXT_COLORS[toast.variant].light;
  const bg = isDark ? cfg.bgDark : cfg.bgLight;

  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withTiming(0, { duration: SLIDE_MS });
    opacity.value = withTiming(1, { duration: SLIDE_MS });

    // Auto-dismiss
    translateY.value = withDelay(
      TOAST_DURATION_MS,
      withTiming(-80, { duration: SLIDE_MS }, (finished) => {
        if (finished) runOnJS(onDismiss)(toast.id);
      }),
    );
    opacity.value = withDelay(
      TOAST_DURATION_MS,
      withTiming(0, { duration: SLIDE_MS }),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.toastItem, { backgroundColor: bg }, animStyle]}>
      <Text style={[styles.icon, { color: textColor }]}>{cfg.icon}</Text>
      <Text style={[styles.text, { color: textColor }]} numberOfLines={3}>
        {toast.text}
      </Text>
      <Pressable
        onPress={() => onDismiss(toast.id)}
        hitSlop={8}
        style={styles.closeBtn}
      >
        <Text style={[styles.closeText, { color: textColor }]}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Provider ────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((text: string, variant: ToastVariant) => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev.slice(-2), { id, text, variant }]); // max 3 visible
  }, []);

  const success = useCallback((text: string) => show(text, "success"), [show]);
  const error = useCallback((text: string) => show(text, "error"), [show]);
  const info = useCallback((text: string) => show(text, "info"), [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, info }}>
      {children}
      <View
        style={[styles.container, Platform.OS === "web" ? ({ pointerEvents: "none" } as ViewStyle) : null]}
        pointerEvents={Platform.OS === "web" ? undefined : "box-none"}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "web" ? 16 : 54,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  toastItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: 480,
    width: "100%",
    // shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  icon: {
    fontSize: 16,
    fontWeight: "700",
    marginRight: 10,
    width: 20,
    textAlign: "center",
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  closeBtn: {
    marginLeft: 8,
    padding: 4,
  },
  closeText: {
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.6,
  },
});
