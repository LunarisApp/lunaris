import type { Metadata } from "next";
import { ProductComparison } from "@/components/sections/product-comparison";
import { getObsidianComparison } from "@/data/product-comparisons";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedAlternates } from "@/i18n/metadata";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);

	return {
		title: dict.obsidianComparisonPage.title,
		description: dict.obsidianComparisonPage.description,
		alternates: localizedAlternates(locale, "/compare/obsidian"),
	};
}

export default async function ObsidianComparisonPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);

	return (
		<ProductComparison
			analyticsId="obsidian_comparison"
			{...getObsidianComparison(dict)}
		/>
	);
}
