import type { Metadata } from "next";
import { ProductComparison } from "@/components/sections/product-comparison";
import { getLinearComparison } from "@/data/product-comparisons";
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
		title: dict.linearComparisonPage.title,
		description: dict.linearComparisonPage.description,
		alternates: localizedAlternates(locale, "/compare/linear"),
	};
}

export default async function LinearComparisonPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);

	return (
		<ProductComparison
			analyticsId="linear_comparison"
			{...getLinearComparison(dict)}
		/>
	);
}
