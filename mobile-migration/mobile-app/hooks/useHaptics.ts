/**
 * useHaptics — centralised haptic feedback for native platforms.
 *
 * No-op on web. Uses expo-haptics under the hood with dynamic import
 * so web bundles never include the native module.
 *
 * Usage:
 *   const haptics = useHaptics();
 *   haptics.light();          // light tap
 *   haptics.medium();         // medium tap
 *   haptics.success();        // success notification
 *   haptics.error();          // error notification
 *   haptics.selection();      // selection tick
 */

import { useCallback, useMemo } from "react";
import { Platform } from "react-native";

type HapticsModule = typeof import("expo-haptics");

let _haptics: HapticsModule | null = null;
let _loading: Promise<HapticsModule> | null = null;

/** Lazy-load expo-haptics once, cache the module. */
function getHaptics(): Promise<HapticsModule> | null {
  if (Platform.OS === "web") return null;
  if (_haptics) return Promise.resolve(_haptics);
  if (!_loading) {
    _loading = import("expo-haptics").then((mod) => {
      _haptics = mod;
      return mod;
    });
  }
  return _loading;
}

/** Fire-and-forget haptic — never throws. */
async function fire(fn: (h: HapticsModule) => Promise<void>): Promise<void> {
  const p = getHaptics();
  if (!p) return;
  try {
    const h = await p;
    await fn(h);
  } catch {
    // Haptics unavailable (simulator, etc.) — swallow
  }
}

export interface HapticsAPI {
  /** Light impact — subtle tap (e.g. toggle, small button). */
  light: () => void;
  /** Medium impact — standard action (e.g. pull-to-refresh snap). */
  medium: () => void;
  /** Heavy impact — significant action (e.g. delete confirmation). */
  heavy: () => void;
  /** Success notification — positive outcome. */
  success: () => void;
  /** Error notification — negative outcome. */
  error: () => void;
  /** Warning notification — caution. */
  warning: () => void;
  /** Selection tick — tiny feedback for toggling/switching. */
  selection: () => void;
}

export function useHaptics(): HapticsAPI {
  const light = useCallback(
    () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Light)),
    [],
  );
  const medium = useCallback(
    () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium)),
    [],
  );
  const heavy = useCallback(
    () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Heavy)),
    [],
  );
  const success = useCallback(
    () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Success)),
    [],
  );
  const error = useCallback(
    () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Error)),
    [],
  );
  const warning = useCallback(
    () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Warning)),
    [],
  );
  const selection = useCallback(
    () => fire((h) => h.selectionAsync()),
    [],
  );

  return useMemo(
    () => ({ light, medium, heavy, success, error, warning, selection }),
    [light, medium, heavy, success, error, warning, selection],
  );
}
