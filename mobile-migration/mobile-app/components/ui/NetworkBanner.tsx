import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import NetInfo from "@react-native-community/netinfo";

export function NetworkBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return unsubscribe;
  }, []);

  if (!isOffline) return null;

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
