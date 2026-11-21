"use client";

import { RootProvider } from "fumadocs-ui/provider/next";
import type { ComponentProps, ReactNode } from "react";
import {
  isLocale,
  type Locale,
  localePath,
  stripLocalePrefix,
} from "../../lib/locale";

export function Providers({
  children,
  i18n,
  locale,
}: {
  children: ReactNode;
  i18n: NonNullable<ComponentProps<typeof RootProvider>["i18n"]>;
  locale: Locale;
}) {
  function changeLocale(target: string) {
    if (!isLocale(target) || target === locale) {
      return;
    }

    const { pathname, search, hash } = window.location;
    window.location.assign(
      localePath(target, stripLocalePrefix(pathname, locale)) + search + hash
    );
  }

  return (
    <RootProvider i18n={{ ...i18n, onLocaleChange: changeLocale }}>
      {children}
    </RootProvider>
  );
}
