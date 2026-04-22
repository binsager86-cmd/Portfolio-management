/**
 * LoadingScreen — unified loading component with spinner, skeleton, and shimmer variants.
 * Theme-aware. Use across all screens for consistent loading states.
 */

import { useThemeStore } from "@/services/themeStore";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from "react-native";
import type { DimensionValue } from "react-native";

type LoadingType = "spinner" | "skeleton" | "shimmer";

interface LoadingScreenProps {
  type?: LoadingType;
  message?: string;
  fullscreen?: boolean;
  /** Number of skeleton rows to display (skeleton/shimmer only) */
  rows?: number;
}

/** Animated shimmer bar used by skeleton and shimmer variants. */
function ShimmerBar({ width, height, colors, animate }: {
  width: number | string;
  height: number;
  colors: { bgCardHover: string; borderColor: string };
  animate: boolean;
}) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.ease,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, shimmerAnim]);

  const bg = animate
    ? shimmerAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [colors.bgCardHover, colors.borderColor, colors.bgCardHover],
      })
    : colors.bgCardHover;

  return (
    <Animated.View
      style={{
        width: width as DimensionValue,
        height,
        borderRadius: 6,
        backgroundColor: bg,
        marginBottom: 10,
      }}
    />
  );
}

export function LoadingScreen({
  type = "spinner",
  message,
  fullscreen = true,
  rows = 4,
}: LoadingScreenProps) {
  const { colors } = useThemeStore();

  const wrapperStyle = fullscreen
    ? [styles.container, { backgroundColor: colors.bgPrimary }]
    : [styles.inline];

  if (type === "spinner") {
    return (
      <View style={wrapperStyle}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        {message != null && (
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            {message}
          </Text>
        )}
      </View>
    );
  }

  // skeleton or shimmer
  const animate = type === "shimmer";
  const widths = ["100%", "85%", "92%", "78%", "88%", "70%"];
  return (
    <View style={wrapperStyle}>
      {message != null && (
        <Text style={[styles.text, { color: colors.textSecondary, marginBottom: 16 }]}>
          {message}
        </Text>
      )}
      <View style={styles.skeletonWrap}>
        {Array.from({ length: rows }, (_, i) => (
          <ShimmerBar
            key={i}
            width={widths[i % widths.length]}
            height={16}
            colors={colors}
            animate={animate}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  inline: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  text: {
    marginTop: 12,
    fontSize: 15,
  },
  skeletonWrap: {
    width: "100%",
    paddingHorizontal: 20,
  },
});
