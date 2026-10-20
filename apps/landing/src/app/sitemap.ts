import type { MetadataRoute } from "next";

import { defaultLocale, locales } from "@/i18n/config";
import { siteUrl } from "@/i18n/metadata";

const routes = [
	"",
	"/pricing",
	"/self-hosted",
	"/mcp",
	"/compare/linear",
	"/compare/obsidian",
	"/compare/notion",
	"/demo",
	"/watch",
	"/tools/word-counter",
];

const nonDefaultLocales = locales.filter((locale) => locale !== defaultLocale);

function languageAlternates(route: string) {
	return {
		en: `${siteUrl}${route}`,
		...Object.fromEntries(
			nonDefaultLocales.map((l) => [l, `${siteUrl}/${l}${route}`]),
		),
	};
}

export default function sitemap(): MetadataRoute.Sitemap {
	return routes.flatMap((route) => [
		{
			url: `${siteUrl}${route}`,
			alternates: { languages: languageAlternates(route) },
		},
		...nonDefaultLocales.map((locale) => ({
			url: `${siteUrl}/${locale}${route}`,
			alternates: { languages: languageAlternates(route) },
		})),
	]);
}
