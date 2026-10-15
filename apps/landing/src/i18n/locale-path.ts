import type { Locale } from "@/i18n/config";

export function localePath(locale: Locale, path: string) {
	if (locale === "en") return path;
	if (path === "/") return `/${locale}`;
	return `/${locale}${path}`;
}

export function switchLocalePath(
	currentLocale: Locale,
	targetLocale: Locale,
	currentPath: string,
) {
	const currentPrefix = currentLocale === "en" ? "" : `/${currentLocale}`;
	const pathWithoutLocale =
		currentPrefix &&
		(currentPath === currentPrefix ||
			currentPath.startsWith(`${currentPrefix}/`))
			? currentPath.slice(currentPrefix.length) || "/"
			: currentPath;

	return localePath(targetLocale, pathWithoutLocale);
}
