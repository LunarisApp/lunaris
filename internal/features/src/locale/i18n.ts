import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";

export const SUPPORTED_LOCALES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  {
    code: "pt-BR",
    label: "Portuguese (Brazil)",
    nativeLabel: "Português (Brasil)",
  },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"];

const STORAGE_KEY = "lunaris.locale";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
      "pt-BR": { translation: ptBR },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "es", "fr", "de", "pt-BR"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;
