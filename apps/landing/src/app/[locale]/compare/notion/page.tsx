import type { Metadata } from "next";
import {
	ProductComparison,
	type ComparisonGroup,
	type ComparisonProduct,
} from "@/components/sections/product-comparison";
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
		title: dict.notionComparisonPage.title,
		description: dict.notionComparisonPage.description,
		alternates: localizedAlternates(locale, "/compare/notion"),
	};
}

export default async function NotionComparisonPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);
	const copy = dict.notionComparisonPage;
	const products: [ComparisonProduct, ComparisonProduct] = [
		{ id: "lunaris", name: copy.table.lunaris },
		{ id: "notion", name: copy.table.notion },
	];

	const groups: ComparisonGroup[] = [
		{
			title: copy.table.categories.access.title,
			features: [
				{
					name: copy.table.categories.access.features.offlineModel,
					values: [
						copy.table.values.offlineFirst,
						copy.table.values.downloadedPages,
					],
				},
				{
					name: copy.table.categories.access.features.localOnly,
					values: [
						copy.table.values.localWorkspaces,
						copy.table.values.cloudOrganization,
					],
				},
			],
		},
		{
			title: copy.table.categories.control.title,
			features: [
				{
					name: copy.table.categories.control.features.dataLocation,
					values: [
						copy.table.values.deviceOrRegion,
						copy.table.values.enterpriseResidency,
					],
				},
				{
					name: copy.table.categories.control.features.organizationShape,
					values: [copy.table.values.extensionLed, copy.table.values.allInOne],
				},
			],
		},
		{
			title: copy.table.categories.connections.title,
			features: [
				{
					name: copy.table.categories.connections.features.customization,
					values: [
						copy.table.values.nativeExtensions,
						copy.table.values.integrations,
					],
				},
				{
					name: copy.table.categories.connections.features.agentAccess,
					values: [copy.table.values.mcp, copy.table.values.api],
				},
			],
		},
	];

	const sources = [
		{
			href: "https://www.notion.com/help/use-pages-offline",
			label: copy.sources.offline,
		},
		{
			href: "https://www.notion.com/help/back-up-your-data",
			label: copy.sources.backup,
		},
		{
			href: "https://www.notion.com/help/data-residency",
			label: copy.sources.residency,
		},
		{
			href: "https://developers.notion.com/guides/get-started/overview",
			label: copy.sources.api,
		},
	];

	return (
		<ProductComparison
			analyticsId="notion_comparison"
			copy={copy}
			groups={groups}
			products={products}
			sources={sources}
		/>
	);
}
