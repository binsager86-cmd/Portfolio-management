import { useAdminGate } from "@/hooks/useAdminGate";
import React, { Suspense } from "react";
import { ActivityIndicator, Text, View } from "react-native";

const AdminDashboardScreen = React.lazy(() => import("@/src/screens/AdminDashboardScreen"));

const LoadingFallback = (
  <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
    <ActivityIndicator size="large" />
  </View>
);

export default function AdminRoute() {
  const { isAdmin, isLoading } = useAdminGate();

  if (isLoading) return LoadingFallback;

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#888", fontSize: 16 }}>Admin access required.</Text>
      </View>
    );
  }

  return (
    <Suspense fallback={LoadingFallback}>
      <AdminDashboardScreen />
    </Suspense>
  );
}
