export const defaultLocale = "en";
export const locales = ["en", "es", "fr", "de", "pt-BR"] as const;
export type Locale = (typeof locales)[number];
