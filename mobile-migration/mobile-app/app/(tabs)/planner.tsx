import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

const PlannerScreen = React.lazy(() => import("@/src/screens/PlannerScreen"));

export default function PlannerRoute() {
  return (
    <Suspense fallback={<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" /></View>}>
      <PlannerScreen />
    </Suspense>
  );
}
