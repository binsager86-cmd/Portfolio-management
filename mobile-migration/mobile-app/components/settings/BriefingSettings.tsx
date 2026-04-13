/**
 * BriefingSettings — opt-in UI for daily WhatsApp / email briefings.
 *
 * Features:
 *  - Channel toggle (WhatsApp / Email)
 *  - Phone / email input with validation
 *  - Schedule hour picker
 *  - Content toggles (market pulse, dividends, alerts)
 *  - Real-time validation feedback
 */

import { analytics } from "@/lib/analytics";
import {
    loadBriefingPrefs,
    saveBriefingPrefs,
    validateBriefingPrefs,
    type BriefingChannel,
    type BriefingPrefs,
} from "@/services/briefings";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    I18nManager,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";

export function BriefingSettings() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL;

  const [prefs, setPrefs] = useState<BriefingPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadBriefingPrefs().then(setPrefs);
  }, []);

  const update = useCallback(
    (partial: Partial<BriefingPrefs>) => {
      if (!prefs) return;
      const next = { ...prefs, ...partial };
      setPrefs(next);
      setError(null);
      setSaved(false);
    },
    [prefs],
  );

  const handleSave = useCallback(async () => {
    if (!prefs) return;
    const validationError = validateBriefingPrefs(prefs);
    if (validationError) {
      setError(validationError);
      return;
    }
    await saveBriefingPrefs(prefs);
    setSaved(true);
    analytics.logEvent("briefing_configured", {
      channel: prefs.channel,
      enabled: prefs.enabled,
    });
  }, [prefs]);

  if (!prefs) return null;

  return (
    <View style={[s.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      {/* Header */}
      <View style={[s.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text style={s.emoji}>📬</Text>
        <View style={[s.headerText, isRTL && { alignItems: "flex-end" }]}>
          <Text style={[s.title, { color: colors.textPrimary }]}>
            {t("briefings.title")}
          </Text>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>
            {t("briefings.subtitle")}
          </Text>
        </View>
      </View>

      {/* Enable toggle */}
      <SettingsRow
        colors={colors}
        isRTL={isRTL}
        label={t("briefings.enable")}
        right={
          <Switch
            value={prefs.enabled}
            onValueChange={(v) => update({ enabled: v })}
            trackColor={{ true: colors.accentPrimary + "40", false: colors.borderColor }}
            thumbColor={prefs.enabled ? colors.accentPrimary : colors.textMuted}
          />
        }
      />

      {prefs.enabled && (
        <>
          {/* Channel selector */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
            {t("briefings.channel")}
          </Text>
          <View style={[s.channelRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {(["whatsapp", "email"] as BriefingChannel[]).map((ch) => (
              <Pressable
                key={ch}
                onPress={() => update({ channel: ch })}
                style={[
                  s.channelBtn,
                  {
                    backgroundColor:
                      prefs.channel === ch
                        ? colors.accentPrimary + "15"
                        : colors.bgInput,
                    borderColor:
                      prefs.channel === ch ? colors.accentPrimary : colors.borderColor,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: prefs.channel === ch }}
              >
                <FontAwesome
                  name={ch === "whatsapp" ? "whatsapp" : "envelope"}
                  size={16}
                  color={prefs.channel === ch ? colors.accentPrimary : colors.textMuted}
                />
                <Text
                  style={[
                    s.channelLabel,
                    { color: prefs.channel === ch ? colors.accentPrimary : colors.textMuted },
                  ]}
                >
                  {t(`briefings.${ch}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Phone / Email input */}
          {prefs.channel === "whatsapp" ? (
            <>
              <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
                {t("briefings.phoneNumber")}
              </Text>
              <TextInput
                style={[
                  s.input,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.bgInput,
                    borderColor: colors.borderColor,
                    textAlign: isRTL ? "right" : "left",
                  },
                ]}
                value={prefs.phoneNumber}
                onChangeText={(v) => update({ phoneNumber: v })}
                placeholder="+96512345678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                accessibilityLabel={t("briefings.phoneNumber")}
              />
            </>
          ) : (
            <>
              <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
                {t("briefings.emailAddress")}
              </Text>
              <TextInput
                style={[
                  s.input,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.bgInput,
                    borderColor: colors.borderColor,
                    textAlign: isRTL ? "right" : "left",
                  },
                ]}
                value={prefs.email}
                onChangeText={(v) => update({ email: v })}
                placeholder="user@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel={t("briefings.emailAddress")}
              />
            </>
          )}

          {/* Schedule */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
            {t("briefings.schedule")}
          </Text>
          <View style={[s.scheduleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text style={[s.scheduleText, { color: colors.textPrimary }]}>
              {t("briefings.dailyAt", { hour: formatHour(prefs.scheduleHour) })}
            </Text>
            <Text style={[s.scheduleNote, { color: colors.textMuted }]}>
              (KWT)
            </Text>
          </View>

          {/* Content toggles */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
            {t("briefings.content")}
          </Text>
          <SettingsRow
            colors={colors}
            isRTL={isRTL}
            label={t("briefings.marketPulse")}
            right={
              <Switch
                value={prefs.includeMarketPulse}
                onValueChange={(v) => update({ includeMarketPulse: v })}
                trackColor={{ true: colors.accentPrimary + "40", false: colors.borderColor }}
                thumbColor={prefs.includeMarketPulse ? colors.accentPrimary : colors.textMuted}
              />
            }
          />
          <SettingsRow
            colors={colors}
            isRTL={isRTL}
            label={t("briefings.dividendAlerts")}
            right={
              <Switch
                value={prefs.includeDividendAlerts}
                onValueChange={(v) => update({ includeDividendAlerts: v })}
                trackColor={{ true: colors.accentPrimary + "40", false: colors.borderColor }}
                thumbColor={prefs.includeDividendAlerts ? colors.accentPrimary : colors.textMuted}
              />
            }
          />
          <SettingsRow
            colors={colors}
            isRTL={isRTL}
            label={t("briefings.priceAlerts")}
            right={
              <Switch
                value={prefs.includePriceAlerts}
                onValueChange={(v) => update({ includePriceAlerts: v })}
                trackColor={{ true: colors.accentPrimary + "40", false: colors.borderColor }}
                thumbColor={prefs.includePriceAlerts ? colors.accentPrimary : colors.textMuted}
              />
            }
          />
        </>
      )}

      {/* Error */}
      {error && (
        <View style={[s.errorRow, { backgroundColor: colors.danger + "15" }]}>
          <FontAwesome name="exclamation-circle" size={13} color={colors.danger} />
          <Text style={[s.errorText, { color: colors.danger }]}>{t(error)}</Text>
        </View>
      )}

      {/* Save button */}
      <Pressable
        onPress={handleSave}
        style={[
          s.saveBtn,
          {
            backgroundColor: saved ? colors.success + "20" : colors.accentPrimary + "15",
          },
        ]}
        accessibilityRole="button"
      >
        <FontAwesome
          name={saved ? "check" : "save"}
          size={14}
          color={saved ? colors.success : colors.accentPrimary}
        />
        <Text
          style={[
            s.saveBtnText,
            { color: saved ? colors.success : colors.accentPrimary },
          ]}
        >
          {saved ? t("briefings.saved") : t("app.save")}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function SettingsRow({
  colors,
  isRTL,
  label,
  right,
}: {
  colors: any;
  isRTL: boolean;
  label: string;
  right: React.ReactNode;
}) {
  return (
    <View style={[s.settingsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <Text style={[s.settingsLabel, { color: colors.textPrimary }]}>{label}</Text>
      {right}
    </View>
  );
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:00 ${period}`;
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  header: { alignItems: "flex-start", gap: 10 },
  emoji: { fontSize: 28, marginTop: 2 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 13 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  channelRow: { gap: 10 },
  channelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  channelLabel: { fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  scheduleRow: { alignItems: "center", gap: 6 },
  scheduleText: { fontSize: 14, fontWeight: "600" },
  scheduleNote: { fontSize: 12 },
  settingsRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  settingsLabel: { fontSize: 14 },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 6,
  },
  errorText: { flex: 1, fontSize: 12 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  saveBtnText: { fontSize: 14, fontWeight: "600" },
});
