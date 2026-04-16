import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import NetInfo from "@react-native-community/netinfo";

interface NetworkBannerProps {
  /** Override from useOfflineSync — when provided, skips internal NetInfo subscription. */
  isOffline?: boolean;
}

export function NetworkBanner({ isOffline: externalOffline }: NetworkBannerProps) {
  const [internalOffline, setInternalOffline] = useState(false);

  // Only subscribe if no external signal is provided
  useEffect(() => {
    if (externalOffline !== undefined) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      setInternalOffline(!state.isConnected);
    });
    return unsubscribe;
  }, [externalOffline]);

  const offline = externalOffline ?? internalOffline;
  if (!offline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline mode — showing cached data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: "#f59e0b", padding: 8, alignItems: "center" },
  text: { color: "#000", fontWeight: "600", fontSize: 13 },
});
