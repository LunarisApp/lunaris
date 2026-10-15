"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import {
  applyFontFamily,
  type FontFamily,
  FONT_FAMILY_STORAGE_KEY,
  readStoredFontFamily,
} from "../appearance";

const FontFamilyContext = createContext<{
  fontFamily: FontFamily;
  setFontFamily: (family: FontFamily) => void;
} | null>(null);

export function FontFamilyProvider({ children }: { children: ReactNode }) {
  const [fontFamily, setFontFamilyState] =
    useState<FontFamily>(readStoredFontFamily);

  useLayoutEffect(() => {
    applyFontFamily(document.documentElement, fontFamily);
  }, [fontFamily]);

  const setFontFamily = useCallback((family: FontFamily) => {
    setFontFamilyState(family);
    localStorage.setItem(FONT_FAMILY_STORAGE_KEY, family);
  }, []);

  return (
    <FontFamilyContext.Provider value={{ fontFamily, setFontFamily }}>
      {children}
    </FontFamilyContext.Provider>
  );
}

export function useFontFamily() {
  const context = useContext(FontFamilyContext);
  if (!context) {
    throw new Error("useFontFamily must be used within FontFamilyProvider");
  }
  return context;
}
