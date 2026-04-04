/**
 * useChartAnimation — reusable entrance animation for chart components.
 *
 * Resets and re-animates whenever `data` changes (reference or length),
 * producing a smooth fade-out → fade-in transition on refresh.
 */

import { useEffect, useRef } from "react";
import { Easing, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

export function useChartAnimation(
  data: unknown[] | undefined,
  duration = 1000,
  delay = 200,
) {
  const progress = useSharedValue(0);
  const prevLen = useRef(data?.length ?? 0);

  useEffect(() => {
    const len = data?.length ?? 0;
    if (len === 0) return;

    // Reset then re-animate (quick fade-out → entrance)
    progress.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) {
        progress.value = withDelay(
          delay,
          withTiming(1, {
            duration,
            easing: Easing.out(Easing.cubic),
          }),
        );
      }
    });
    prevLen.current = len;
  }, [data]);

  return progress;
}
