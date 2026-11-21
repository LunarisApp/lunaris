export const defaultLocale = "en";
export const locales = ["en", "es", "fr", "de", "pt-BR"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

export function localePath(locale: Locale, path: string) {
  if (locale === defaultLocale) {
    return path;
  }
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export function stripLocalePrefix(pathname: string, locale: Locale) {
  const prefix = `/${locale}`;
  if (pathname === prefix) {
    return "/";
  }
  return pathname.startsWith(`${prefix}/`)
    ? pathname.slice(prefix.length)
    : pathname;
}
