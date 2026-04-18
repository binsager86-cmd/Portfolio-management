import { useEffect, useState } from "react";
import { Text, View, StyleSheet, TextStyle, ViewStyle } from "react-native";
import { useThemeStore } from "@/services/themeStore";

function formatRelative(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

interface Props {
  /** dataUpdatedAt from React Query (epoch ms). 0 / undefined = hidden */
  timestamp?: number;
  /** Show a pulsing dot when a background refetch is in progress */
  isFetching?: boolean;
  /** Optional label prefix (default: "Updated") */
  label?: string;
  style?: TextStyle;
  containerStyle?: ViewStyle;
}

export function LastUpdated({ timestamp, isFetching, label = "Updated", style, containerStyle }: Props) {
  const { colors } = useThemeStore();
  const [, tick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (!timestamp) return null;

  return (
    <View style={[styles.container, containerStyle]}>
      {isFetching && (
        <View style={[styles.dot, { backgroundColor: colors.accentPrimary }]} />
      )}
      <Text style={[styles.text, { color: colors.textMuted }, style]}>
        {label} {formatRelative(timestamp)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, opacity: 0.7 },
  text: { fontSize: 11, fontWeight: "500" },
});
