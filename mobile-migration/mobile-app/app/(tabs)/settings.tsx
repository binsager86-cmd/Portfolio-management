/**
 * Settings — user profile, change password, update prices.
 *
 * Mirrors Streamlit's Settings functionality.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";

import { useMe, useApiKey } from "@/hooks/queries";
import { changePassword, updatePrices, saveApiKey } from "@/services/api";
import { showErrorAlert } from "@/lib/errorHandling";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenStyles } from "@/hooks/useScreenStyles";

export default function SettingsScreen() {
  const { colors, toggle, mode } = useThemeStore();
  const ss = useScreenStyles();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  // User info
  const { data: user } = useMe();

  // Change password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const pwMutation = useMutation({
    mutationFn: () => changePassword(currentPw, newPw),
    onSuccess: (result) => {
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      const msg = result.message ?? "Password changed successfully";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Success", msg);
    },
    onError: (err) => showErrorAlert("Error", err, "Failed to change password"),
  });

  const priceMutation = useMutation({
    mutationFn: updatePrices,
    onSuccess: (result) => {
      const msg = result.message ?? "Prices updated";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Prices Updated", msg);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Failed to update prices";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  // API Key state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: apiKeyData, refetch: refetchApiKey } = useApiKey();

  const apiKeyMutation = useMutation({
    mutationFn: () => saveApiKey(apiKeyInput),
    onSuccess: (result: any) => {
      setApiKeyInput("");
      refetchApiKey();
      const msg = result.message ?? "API key saved";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Success", msg);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Failed to save API key";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
    },
  });

  const handleChangePw = () => {
    if (!currentPw || !newPw) {
      const msg = "Please fill in all password fields";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Validation", msg);
      return;
    }
    if (newPw !== confirmPw) {
      const msg = "New passwords don't match";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Validation", msg);
      return;
    }
    if (newPw.length < 6) {
      const msg = "Password must be at least 6 characters";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Validation", msg);
      return;
    }
    pwMutation.mutate();
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <ScrollView
      style={ss.container}
      contentContainerStyle={[ss.content, isDesktop && { maxWidth: 600, alignSelf: "center", width: "100%" }]}
    >
      <Text style={[ss.title, { marginBottom: 16 }]}>Settings</Text>

      {/* User Profile */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="user-circle" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Profile</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textSecondary }]}>Username</Text>
          <Text style={[s.infoValue, { color: colors.textPrimary }]}>{user?.username ?? "—"}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textSecondary }]}>Name</Text>
          <Text style={[s.infoValue, { color: colors.textPrimary }]}>{user?.name ?? "—"}</Text>
        </View>
      </View>

      {/* Theme Toggle */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name={mode === "dark" ? "lightbulb-o" : "moon-o"} size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Appearance</Text>
        </View>
        <Pressable
          onPress={toggle}
          style={[s.settingBtn, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>
            Switch to {mode === "dark" ? "Light" : "Dark"} Mode
          </Text>
        </Pressable>
      </View>

      {/* AI API Key */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="key" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>AI API Key</Text>
        </View>
        <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
          Enter your Google Gemini API key to enable AI portfolio analysis.
        </Text>
        {apiKeyData?.has_key && (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <FontAwesome name="check-circle" size={14} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 13 }}>
              Key saved: {apiKeyData.masked_key}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            placeholder="AIzaSy..."
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showApiKey}
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            style={[s.input, { flex: 1, backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
          />
          <Pressable onPress={() => setShowApiKey(!showApiKey)} style={{ padding: 8 }}>
            <FontAwesome name={showApiKey ? "eye-slash" : "eye"} size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => apiKeyMutation.mutate()}
          disabled={apiKeyMutation.isPending || !apiKeyInput.trim()}
          style={[
            s.settingBtn,
            {
              backgroundColor: colors.accentPrimary,
              opacity: apiKeyMutation.isPending || !apiKeyInput.trim() ? 0.5 : 1,
              marginTop: 10,
            },
          ]}
        >
          <Text style={s.btnText}>
            {apiKeyMutation.isPending ? "Saving..." : "Save API Key"}
          </Text>
        </Pressable>
      </View>

      {/* Update Prices */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="refresh" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Price Updates</Text>
        </View>
        <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
          Trigger a manual price update for all stocks from configured sources.
        </Text>
        <Pressable
          onPress={() => priceMutation.mutate()}
          disabled={priceMutation.isPending}
          style={[
            s.settingBtn,
            {
              backgroundColor: colors.accentPrimary,
              opacity: priceMutation.isPending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={s.btnText}>
            {priceMutation.isPending ? "Updating..." : "Update All Prices"}
          </Text>
        </Pressable>
      </View>

      {/* Change Password */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="lock" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Change Password</Text>
        </View>
        <TextInput
          placeholder="Current password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={currentPw}
          onChangeText={setCurrentPw}
          style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
        />
        <TextInput
          placeholder="New password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={newPw}
          onChangeText={setNewPw}
          style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
        />
        <TextInput
          placeholder="Confirm new password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={confirmPw}
          onChangeText={setConfirmPw}
          style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
        />
        <Pressable
          onPress={handleChangePw}
          disabled={pwMutation.isPending}
          style={[
            s.settingBtn,
            {
              backgroundColor: colors.success,
              opacity: pwMutation.isPending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={s.btnText}>
            {pwMutation.isPending ? "Changing..." : "Change Password"}
          </Text>
        </Pressable>
      </View>

      {/* Logout */}
      <Pressable
        onPress={handleLogout}
        style={[s.logoutBtn, { borderColor: colors.danger }]}
      >
        <FontAwesome name="sign-out" size={18} color={colors.danger} />
        <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "600" }}>Sign Out</Text>
      </Pressable>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardDesc: { fontSize: 13, marginBottom: 12 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  settingBtn: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "600" as const },
});
