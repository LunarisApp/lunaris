import type { MetadataRoute } from "next";
import { getPageMap } from "nextra/page-map";

type PageMapEntry = {
	route?: string;
	children?: PageMapEntry[];
};

const siteUrl = "https://docs.lunaris.app";

function collectRoutes(entries: PageMapEntry[]): string[] {
	return entries.flatMap((entry) => [
		...(entry.route ? [entry.route] : []),
		...(entry.children ? collectRoutes(entry.children) : []),
	]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const routes = collectRoutes((await getPageMap()) as PageMapEntry[]);

	return [...new Set(routes)].map((route) => ({
		url: new URL(route, siteUrl).toString(),
	}));
}
