import type { Metadata } from "next";

import { defaultLocale, type Locale, locales } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";

export const siteUrl = "https://lunaris.app";

export const brandIcons: NonNullable<Metadata["icons"]> = {
	icon: [
		{ url: "/favicon.ico", sizes: "any" },
		{
			url: "/favicon-light.svg",
			type: "image/svg+xml",
			media: "(prefers-color-scheme: light)",
		},
		{
			url: "/favicon-dark.svg",
			type: "image/svg+xml",
			media: "(prefers-color-scheme: dark)",
		},
	],
	apple: [
		{
			url: "/apple-touch-icon.png",
			sizes: "180x180",
			type: "image/png",
		},
	],
};

function absoluteUrl(path: string) {
	return path === "/" ? siteUrl : `${siteUrl}${path}`;
}

export function localizedAlternates(
	locale: Locale,
	path: string,
): NonNullable<Metadata["alternates"]> {
	return {
		canonical: absoluteUrl(localePath(locale, path)),
		languages: {
			...Object.fromEntries(
				locales.map((candidateLocale) => [
					candidateLocale,
					absoluteUrl(localePath(candidateLocale, path)),
				]),
			),
			"x-default": absoluteUrl(localePath(defaultLocale, path)),
		},
	};
}
