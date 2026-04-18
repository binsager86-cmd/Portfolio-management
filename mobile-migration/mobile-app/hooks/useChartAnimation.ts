/**
 * useChartAnimation — reusable entrance animation for chart components.
 *
 * Resets and re-animates whenever `data` changes (reference or length),
 * producing a smooth fade-out → fade-in transition on refresh.
 */

import { AccessibilityInfo } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { Motion, TIMING_CHART } from "@/constants/motion";

export function useChartAnimation(
  data: unknown[] | undefined,
  duration = Motion.duration.chart,
  delay = Motion.stagger.section,
) {
  const progress = useSharedValue(0);
  const prevLen = useRef(data?.length ?? 0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        if (mounted) setReduceMotion(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const len = data?.length ?? 0;
    if (len === 0) return;

    // Keep motion subtle on heavy datasets and respect reduced motion.
    if (reduceMotion || len > 120) {
      progress.value = 1;
      prevLen.current = len;
      return;
    }

    // Reset then re-animate (quick fade-out → entrance)
    progress.value = withTiming(0, { duration: Motion.duration.reset }, (finished) => {
      if (finished) {
        progress.value = withDelay(
          delay,
          withTiming(1, {
            duration,
            easing: TIMING_CHART.easing,
          }),
        );
      }
    });
    prevLen.current = len;
  }, [data, reduceMotion]);

  return progress;
}
