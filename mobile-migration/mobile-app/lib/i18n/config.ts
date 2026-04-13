/**
 * i18n configuration — i18next + react-i18next with expo-localization.
 *
 * Usage:
 *   import '@/lib/i18n/config';              // in _layout.tsx (side-effect)
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   t('dashboard.totalValue')               // "Total Portfolio Value"
 */

import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { I18nManager, Platform } from "react-native";

import ar from "./translations/ar.json";
import en from "./translations/en.json";

const RTL_LANGUAGES = ["ar", "he", "fa", "ur"];

/**
 * Apply RTL layout direction.
 * On native this uses I18nManager; on web it sets document.dir.
 */
export function applyRTL(languageCode: string) {
  const isRTL = RTL_LANGUAGES.includes(languageCode);

  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      document.documentElement.dir = isRTL ? "rtl" : "ltr";
    }
  } else {
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.forceRTL(isRTL);
      // Note: On native, forceRTL requires a restart to take full effect.
      // The View-level `direction` style in _layout.tsx handles immediate visual flip.
    }
  }
}

// Detect user's preferred language, fallback to "en"
function getDeviceLanguage(): string {
  try {
    const locales = getLocales();
    const lang = locales?.[0]?.languageCode ?? "en";
    // Only return languages we support
    return lang === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: getDeviceLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
  react: {
    useSuspense: false, // Avoid Suspense boundary issues in RN
  },
});

// Apply RTL on init
applyRTL(i18n.language);

// Apply RTL whenever language changes
i18n.on("languageChanged", (lng) => {
  applyRTL(lng);
});

export default i18n;
