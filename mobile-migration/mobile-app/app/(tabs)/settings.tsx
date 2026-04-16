import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

const SettingsScreen = React.lazy(() => import("@/src/screens/SettingsScreen"));

export default function SettingsRoute() {
  return (
    <Suspense fallback={<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" /></View>}>
      <SettingsScreen />
    </Suspense>
  );
}
