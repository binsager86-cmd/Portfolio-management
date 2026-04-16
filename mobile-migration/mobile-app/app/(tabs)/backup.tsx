import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

const BackupRestoreScreen = React.lazy(() => import("@/src/screens/BackupRestoreScreen"));

export default function BackupRoute() {
  return (
    <Suspense fallback={<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" /></View>}>
      <BackupRestoreScreen />
    </Suspense>
  );
}
