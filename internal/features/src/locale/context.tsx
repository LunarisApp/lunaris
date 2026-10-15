"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import type { LocaleCode } from "./i18n";

const STORAGE_KEY = "lunaris.locale";

const LocaleContext = createContext<{
  locale: string;
  setLocale: (code: LocaleCode) => void;
} | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  const setLocale = useCallback(
    (code: LocaleCode) => {
      i18n.changeLanguage(code);
      localStorage.setItem(STORAGE_KEY, code);
      document.documentElement.lang = code;
    },
    [i18n]
  );

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <LocaleContext.Provider value={{ locale: i18n.language, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
