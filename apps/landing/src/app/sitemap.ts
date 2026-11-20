import type { MetadataRoute } from "next";

import { landingPages } from "@/data/landing-pages";
import { defaultLocale, locales } from "@/i18n/config";
import { siteUrl } from "@/i18n/metadata";

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
	return landingPages.flatMap(({ path }) => {
		const route = path === "/" ? "" : path;
		const languages = languageAlternates(route);

		return [
			{ url: `${siteUrl}${route}`, alternates: { languages } },
			...nonDefaultLocales.map((locale) => ({
				url: `${siteUrl}/${locale}${route}`,
				alternates: { languages },
			})),
		];
	});
}
