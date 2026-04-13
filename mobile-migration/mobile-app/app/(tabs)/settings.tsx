/**
 * Settings — user profile, change password, update prices.
 *
 * Mirrors Streamlit's Settings functionality.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { useToast } from "@/components/ui/ToastProvider";
import { useApiKey, useMe } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenStyles } from "@/hooks/useScreenStyles";
import { showErrorAlert } from "@/lib/errorHandling";
import i18n from "@/lib/i18n/config";
import { requestNotificationPermissions } from "@/services/alerts/notificationService";
import { changePassword, resetAccount, saveApiKey, updateName, updatePrices } from "@/services/api";
import { useAuthStore } from "@/services/authStore";
import { sendPriceUpdateNotification } from "@/services/notifications/priceUpdateNotification";
import { useThemeStore } from "@/services/themeStore";
import { EXPERTISE_LEVELS, ExpertiseLevel, useUserPrefsStore } from "@/src/store/userPrefsStore";
import { useTranslation } from "react-i18next";

export default function SettingsScreen() {
  const { colors, toggle, mode } = useThemeStore();
  const ss = useScreenStyles();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const authUsername = useAuthStore((s) => s.username);
  const authName = useAuthStore((s) => s.name);
  const { t } = useTranslation();
  const toast = useToast();
  const {
    preferences,
    setExpertiseLevel,
    setLanguage,
    toggleAdvancedMetrics,
    toggleShariaFilter,
    toggleDividendFocus,
    toggleNotification,
    resetToDefaults,
  } = useUserPrefsStore();

  // Expertise level change confirmation modal
  const [pendingLevel, setPendingLevel] = useState<ExpertiseLevel | null>(null);

  const handleLevelSelect = (level: ExpertiseLevel) => {
    if (level === preferences.expertiseLevel) return;
    setPendingLevel(level);
  };

  const confirmLevelChange = () => {
    if (!pendingLevel) return;
    setExpertiseLevel(pendingLevel);
    const config = EXPERTISE_LEVELS.find((l) => l.key === pendingLevel);
    toast.success(t('settingsScreen.switchedToMode', { mode: config?.label ?? pendingLevel }));
    setPendingLevel(null);
  };

  // User info
  const { data: user } = useMe();

  // Editable name
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const nameMutation = useMutation({
    mutationFn: (newName: string) => updateName(newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setIsEditingName(false);
      toast.success(t('settings.nameSaved') || t('settingsScreen.nameUpdated'));
    },
    onError: (err) => showErrorAlert(t('app.error'), err, t('settingsScreen.failedToUpdateName')),
  });

  const handleEditName = () => {
    setNameInput(user?.name || authName || "");
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    nameMutation.mutate(trimmed);
  };

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
      const msg = result.message ?? t('settingsScreen.passwordChanged');
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t('app.success'), msg);
    },
    onError: (err) => showErrorAlert(t('app.error'), err, t('settingsScreen.failedToChangePw')),
  });

  const priceMutation = useMutation({
    mutationFn: updatePrices,
    onSuccess: (result) => {
      const msg = result.message ?? t('settingsScreen.pricesUpdated');
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t('settingsScreen.priceUpdates'), msg);
      sendPriceUpdateNotification({
        updatedCount: result.updated_count ?? result.updatedCount ?? 0,
        message: result.message,
      }).catch(() => {});
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? t('settingsScreen.failedToUpdatePrices');
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t('app.error'), msg);
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
      const msg = result.message ?? t('settingsScreen.apiKeySaved');
      Platform.OS === "web" ? window.alert(msg) : Alert.alert(t('app.success'), msg);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? t('settingsScreen.failedToSaveApiKey');
      Platform.OS === "web" ? window.alert(msg) : Alert.alert(t('app.error'), msg);
    },
  });

  const handleChangePw = () => {
    if (!currentPw || !newPw) {
      const msg = t('settingsScreen.fillAllPwFields');
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t('settingsScreen.validation'), msg);
      return;
    }
    if (newPw !== confirmPw) {
      const msg = t('settingsScreen.pwsDontMatch');
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t('settingsScreen.validation'), msg);
      return;
    }
    if (newPw.length < 6) {
      const msg = t('settingsScreen.pwMinLength');
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t('settingsScreen.validation'), msg);
      return;
    }
    pwMutation.mutate();
  };

  /* ── Reset Account ── */
  const resetMutation = useMutation({
    mutationFn: resetAccount,
    onSuccess: () => {
      queryClient.invalidateQueries();
      const msg = t('settingsScreen.resetSuccess');
      Platform.OS === "web" ? window.alert(msg) : Alert.alert(t('app.success'), msg);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? t('settingsScreen.resetFailed');
      Platform.OS === "web" ? window.alert(msg) : Alert.alert(t('app.error'), msg);
    },
  });

  const handleResetAccount = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(t('settingsScreen.resetConfirmMessage'));
      if (confirmed) resetMutation.mutate();
    } else {
      Alert.alert(
        t('settingsScreen.resetConfirmTitle'),
        t('settingsScreen.resetConfirmMessage'),
        [
          { text: t('app.cancel'), style: "cancel" },
          { text: t('settingsScreen.resetConfirmBtn'), style: "destructive", onPress: () => resetMutation.mutate() },
        ],
      );
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <>
    <ScrollView
      style={ss.container}
      contentContainerStyle={[ss.content, isDesktop && { maxWidth: 600, alignSelf: "center", width: "100%" }]}
    >
      <Text style={[ss.title, { marginBottom: 16 }]}>{t('settings.title')}</Text>

      {/* User Profile */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="user-circle" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('settings.profile')}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textSecondary }]}>{t('settings.username')}</Text>
          <Text style={[s.infoValue, { color: colors.textPrimary }]}>{user?.username || authUsername || "—"}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textSecondary }]}>{t('settings.name')}</Text>
          {isEditingName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                onSubmitEditing={handleSaveName}
                autoFocus
                style={[s.input, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgPrimary, marginBottom: 0, flex: 1, maxWidth: 180, paddingVertical: 6 }]}
                placeholder={t('settings.name')}
                placeholderTextColor={colors.textSecondary}
              />
              <Pressable onPress={handleSaveName} disabled={nameMutation.isPending}>
                <FontAwesome name="check" size={16} color={colors.accentPrimary} />
              </Pressable>
              <Pressable onPress={() => setIsEditingName(false)}>
                <FontAwesome name="times" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handleEditName} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[s.infoValue, { color: colors.textPrimary }]}>{user?.name || authName || "—"}</Text>
              <FontAwesome name="pencil" size={13} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Theme Toggle */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name={mode === "dark" ? "lightbulb-o" : "moon-o"} size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('settings.appearance')}</Text>
        </View>
        <Pressable
          onPress={toggle}
          style={[s.settingBtn, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>
            {mode === "dark" ? t('settings.switchToLight') : t('settings.switchToDark')}
          </Text>
        </Pressable>
      </View>

      {/* App Preferences */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="sliders" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('settings.appPreferences')}</Text>
        </View>

        {/* Expertise Level */}
        <Text style={[s.prefLabel, { color: colors.textSecondary }]}>{t('settings.expertiseLevel')}</Text>
        <View style={{ gap: 8, marginBottom: 14 }}>
          {EXPERTISE_LEVELS.map((level) => (
            <Pressable
              key={level.key}
              onPress={() => handleLevelSelect(level.key)}
              style={[
                s.levelCard,
                {
                  backgroundColor:
                    preferences.expertiseLevel === level.key ? colors.accentPrimary + "12" : colors.bgPrimary,
                  borderColor:
                    preferences.expertiseLevel === level.key ? colors.accentPrimary : colors.borderColor,
                  borderWidth: preferences.expertiseLevel === level.key ? 2 : 1,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <FontAwesome
                  name={level.icon as any}
                  size={16}
                  color={
                    preferences.expertiseLevel === level.key ? colors.accentPrimary : colors.textSecondary
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color:
                        preferences.expertiseLevel === level.key ? colors.accentPrimary : colors.textPrimary,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    {level.label}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                    {level.description}
                  </Text>
                </View>
                <View
                  style={[
                    s.radioOuter,
                    {
                      borderColor:
                        preferences.expertiseLevel === level.key ? colors.accentPrimary : colors.textMuted,
                    },
                  ]}
                >
                  {preferences.expertiseLevel === level.key && (
                    <View style={[s.radioInner, { backgroundColor: colors.accentPrimary }]} />
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Language Toggle */}
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.prefLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
              {t('settings.language')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {preferences.language === "ar" ? t('settings.rtlBeta') : t('settings.englishDefault')}
            </Text>
          </View>
          <View style={s.segmentRow}>
            <Pressable
              onPress={() => { setLanguage("en"); i18n.changeLanguage("en"); }}
              style={[
                s.segmentBtn,
                {
                  backgroundColor: preferences.language === "en" ? colors.accentPrimary : colors.bgPrimary,
                  borderColor: colors.borderColor,
                  paddingHorizontal: 16,
                },
              ]}
            >
              <Text
                style={{
                  color: preferences.language === "en" ? "#fff" : colors.textPrimary,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                EN
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setLanguage("ar"); i18n.changeLanguage("ar"); }}
              style={[
                s.segmentBtn,
                {
                  backgroundColor: preferences.language === "ar" ? colors.accentPrimary : colors.bgPrimary,
                  borderColor: colors.borderColor,
                  paddingHorizontal: 16,
                },
              ]}
            >
              <Text
                style={{
                  color: preferences.language === "ar" ? "#fff" : colors.textPrimary,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                AR
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Show Advanced Metrics (only if not normal) */}
        {preferences.expertiseLevel !== "normal" && (
          <Pressable onPress={toggleAdvancedMetrics} style={s.switchRow}>
            <Text style={[s.prefLabel, { color: colors.textSecondary, flex: 1, marginBottom: 0 }]}>
              {t('settingsScreen.showAdvancedMetrics')}
            </Text>
            <View
              style={[
                s.toggleTrack,
                { backgroundColor: preferences.showAdvancedMetrics ? colors.accentPrimary : colors.bgPrimary },
              ]}
            >
              <View
                style={[
                  s.toggleThumb,
                  preferences.showAdvancedMetrics && { alignSelf: "flex-end" },
                ]}
              />
            </View>
          </Pressable>
        )}

        {/* Enable Sharia Filter */}
        <Pressable onPress={toggleShariaFilter} style={s.switchRow}>
          <Text style={[s.prefLabel, { color: colors.textSecondary, flex: 1, marginBottom: 0 }]}>
            {t('settingsScreen.enableShariaFilter')}
          </Text>
          <View
            style={[
              s.toggleTrack,
              { backgroundColor: preferences.enableShariaFilter ? colors.accentPrimary : colors.bgPrimary },
            ]}
          >
            <View
              style={[
                s.toggleThumb,
                preferences.enableShariaFilter && { alignSelf: "flex-end" },
              ]}
            />
          </View>
        </Pressable>

        {/* Dividend Focus Mode */}
        <Pressable onPress={toggleDividendFocus} style={s.switchRow}>
          <Text style={[s.prefLabel, { color: colors.textSecondary, flex: 1, marginBottom: 0 }]}>
            {t('settingsScreen.dividendFocusMode')}
          </Text>
          <View
            style={[
              s.toggleTrack,
              { backgroundColor: preferences.dividendFocus ? colors.accentPrimary : colors.bgPrimary },
            ]}
          >
            <View
              style={[
                s.toggleThumb,
                preferences.dividendFocus && { alignSelf: "flex-end" },
              ]}
            />
          </View>
        </Pressable>

        {/* Reset to Defaults */}
        <Pressable
          onPress={resetToDefaults}
          style={[s.settingBtn, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor, marginTop: 8 }]}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
            {t('settingsScreen.resetToDefaults')}
          </Text>
        </Pressable>
      </View>

      {/* AI API Key */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="bell" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('settingsScreen.notifications')}</Text>
        </View>
        <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
          {t('settingsScreen.notificationsDesc')}
        </Text>

        {/* News Notifications */}
        <Pressable onPress={() => toggleNotification("newsNotifications")} style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.prefLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
              {t('settingsScreen.newsNotifications')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {t('settingsScreen.newsNotificationsDescFull')}
            </Text>
          </View>
          <View style={[s.toggleTrack, { backgroundColor: preferences.notifications.newsNotifications ? colors.accentPrimary : colors.bgPrimary }]}>
            <View style={[s.toggleThumb, preferences.notifications.newsNotifications && { alignSelf: "flex-end" }]} />
          </View>
        </Pressable>

        {/* Portfolio Updates */}
        <Pressable onPress={() => toggleNotification("portfolioUpdates")} style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.prefLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
              {t('settingsScreen.portfolioUpdates')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {t('settingsScreen.portfolioUpdatesDescFull')}
            </Text>
          </View>
          <View style={[s.toggleTrack, { backgroundColor: preferences.notifications.portfolioUpdates ? colors.accentPrimary : colors.bgPrimary }]}>
            <View style={[s.toggleThumb, preferences.notifications.portfolioUpdates && { alignSelf: "flex-end" }]} />
          </View>
        </Pressable>

        {/* Price Alerts */}
        <Pressable onPress={() => toggleNotification("priceAlerts")} style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.prefLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
              {t('settingsScreen.priceAlertsLabel')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {t('settingsScreen.priceAlertsDescFull')}
            </Text>
          </View>
          <View style={[s.toggleTrack, { backgroundColor: preferences.notifications.priceAlerts ? colors.accentPrimary : colors.bgPrimary }]}>
            <View style={[s.toggleThumb, preferences.notifications.priceAlerts && { alignSelf: "flex-end" }]} />
          </View>
        </Pressable>

        {/* Daily Price Updates */}
        <Pressable onPress={() => toggleNotification("dailyPriceUpdates")} style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.prefLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
              {t('settingsScreen.dailyPriceUpdates')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {t('settingsScreen.dailyPriceUpdatesDescFull')}
            </Text>
          </View>
          <View style={[s.toggleTrack, { backgroundColor: preferences.notifications.dailyPriceUpdates ? colors.accentPrimary : colors.bgPrimary }]}>
            <View style={[s.toggleThumb, preferences.notifications.dailyPriceUpdates && { alignSelf: "flex-end" }]} />
          </View>
        </Pressable>

        {/* Open Phone Notification Settings (native only) */}
        {Platform.OS !== "web" && (
          <Pressable
            onPress={async () => {
              const granted = await requestNotificationPermissions();
              if (!granted) {
                Alert.alert(
                  t('settingsScreen.notificationsDisabled'),
                  t('settingsScreen.enableNotificationsMsg'),
                  [
                    { text: t('app.cancel'), style: "cancel" },
                    { text: t('settingsScreen.openSettings'), onPress: () => {
                      import("expo-linking").then((Linking) => Linking.openSettings());
                    }},
                  ]
                );
              } else {
                toast.success(t('settingsScreen.notificationsEnabled'));
              }
            }}
            style={[s.settingBtn, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor, marginTop: 8 }]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
              <FontAwesome name="cog" size={13} color={colors.textSecondary} />{" "}
              {t('settingsScreen.phoneNotificationSettings')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* AI API Key */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="key" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('settingsScreen.aiApiKey')}</Text>
        </View>
        <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
          {t('settingsScreen.aiApiKeyDescFull')}
        </Text>
        <Pressable
          onPress={() => import("expo-linking").then((Linking) => Linking.openURL("https://aistudio.google.com/apikey"))}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}
        >
          <FontAwesome name="external-link" size={13} color={colors.accentPrimary} />
          <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>
            {t('settingsScreen.howToGetKey')}
          </Text>
        </Pressable>
        {apiKeyData?.has_key && (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <FontAwesome name="check-circle" size={14} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 13 }}>
              {t('settingsScreen.keySaved')} {apiKeyData.masked_key}
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
            {apiKeyMutation.isPending ? t('settingsScreen.saving') : t('settingsScreen.saveApiKey')}
          </Text>
        </Pressable>
      </View>

      {/* Update Prices */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="refresh" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('settingsScreen.priceUpdates')}</Text>
        </View>
        <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
          {t('settingsScreen.priceUpdatesDescFull')}
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
            {priceMutation.isPending ? t('settingsScreen.updating') : t('settingsScreen.updateAllPrices')}
          </Text>
        </Pressable>
      </View>

      {/* Change Password */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="lock" size={20} color={colors.accentPrimary} />
          <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('settingsScreen.changePassword')}</Text>
        </View>
        <TextInput
          placeholder={t('settingsScreen.currentPasswordPlaceholder')}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={currentPw}
          onChangeText={setCurrentPw}
          style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
        />
        <TextInput
          placeholder={t('settingsScreen.newPasswordPlaceholder')}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={newPw}
          onChangeText={setNewPw}
          style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
        />
        <TextInput
          placeholder={t('settingsScreen.confirmNewPasswordPlaceholder')}
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
            {pwMutation.isPending ? t('settingsScreen.changing') : t('settingsScreen.changePassword')}
          </Text>
        </Pressable>
      </View>

      {/* ── Danger Zone ── */}
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.danger + "40" }]}>
        <View style={s.cardHeader}>
          <FontAwesome name="exclamation-triangle" size={18} color={colors.danger} />
          <Text style={[s.cardTitle, { color: colors.danger }]}>{t('settingsScreen.dangerZone')}</Text>
        </View>
        <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
          {t('settingsScreen.resetDescription')}
        </Text>
        <Pressable
          onPress={handleResetAccount}
          disabled={resetMutation.isPending}
          style={[
            s.settingBtn,
            {
              backgroundColor: colors.danger,
              opacity: resetMutation.isPending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={s.btnText}>
            {resetMutation.isPending ? t('settingsScreen.resetting') : t('settingsScreen.deleteAllData')}
          </Text>
        </Pressable>
      </View>

      {/* Logout */}
      <Pressable
        onPress={handleLogout}
        style={[s.logoutBtn, { borderColor: colors.danger }]}
      >
        <FontAwesome name="sign-out" size={18} color={colors.danger} />
        <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "600" }}>{t('settingsScreen.signOut')}</Text>
      </Pressable>

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* ── Level Change Confirmation Modal ── */}
    <Modal
      visible={pendingLevel !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setPendingLevel(null)}
    >
      <Pressable
        style={s.modalBackdrop}
        onPress={() => setPendingLevel(null)}
      >
        <View style={[s.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          {pendingLevel && (() => {
            const config = EXPERTISE_LEVELS.find((l) => l.key === pendingLevel);
            const current = EXPERTISE_LEVELS.find((l) => l.key === preferences.expertiseLevel);
            if (!config) return null;
            return (
              <>
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <View style={[s.modalIconCircle, { backgroundColor: colors.accentPrimary + "15" }]}>
                    <FontAwesome name={config.icon as any} size={28} color={colors.accentPrimary} />
                  </View>
                  <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
                    {t('settingsScreen.changeTo', { level: config.label })}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 4 }}>
                    {config.description}
                  </Text>
                </View>

                <View style={[s.modalChangeRow, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t('settingsScreen.current')}</Text>
                    <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14, marginTop: 2 }}>
                      {current?.label ?? preferences.expertiseLevel}
                    </Text>
                  </View>
                  <FontAwesome name="arrow-right" size={14} color={colors.accentPrimary} />
                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t('settingsScreen.new')}</Text>
                    <Text style={{ color: colors.accentPrimary, fontWeight: "700", fontSize: 14, marginTop: 2 }}>
                      {config.label}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", marginBottom: 16 }}>
                  {t('settingsScreen.tabVisibility')}
                </Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => setPendingLevel(null)}
                    style={[s.modalBtn, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor, borderWidth: 1, flex: 1 }]}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 14 }}>{t('app.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmLevelChange}
                    style={[s.modalBtn, { backgroundColor: colors.accentPrimary, flex: 1 }]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{t('app.confirm')}</Text>
                  </Pressable>
                </View>
              </>
            );
          })()}
        </View>
      </Pressable>
    </Modal>
    </>
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
  prefLabel: { fontSize: 14, fontWeight: "500" as const, marginBottom: 8 },
  segmentRow: { flexDirection: "row" as const, gap: 6, marginBottom: 14 },
  segmentBtn: {
    flex: 1,
    alignItems: "center" as const,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 10,
    marginBottom: 4,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: "center" as const,
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  levelCard: {
    padding: 12,
    borderRadius: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    textAlign: "center" as const,
  },
  modalChangeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },
  modalBtn: {
    alignItems: "center" as const,
    paddingVertical: 12,
    borderRadius: 10,
  },
});
