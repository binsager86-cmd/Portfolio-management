import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

const IntegrityScreen = React.lazy(() => import("@/src/screens/IntegrityScreen"));

export default function IntegrityRoute() {
  return (
    <Suspense fallback={<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" /></View>}>
      <IntegrityScreen />
    </Suspense>
  );
}
