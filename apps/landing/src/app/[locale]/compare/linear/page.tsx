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
	const copy = dict.linearComparisonPage;
	const products: [ComparisonProduct, ComparisonProduct] = [
		{ id: "lunaris", name: copy.table.lunaris },
		{ id: "linear", name: copy.table.linear },
	];

	const groups: ComparisonGroup[] = [
		{
			title: copy.table.categories.organization.title,
			features: [
				{
					name: copy.table.categories.organization.features.structure,
					values: [
						copy.table.values.nestedFolders,
						copy.table.values.attachedDocuments,
					],
				},
				{
					name: copy.table.categories.organization.features.navigation,
					values: [
						copy.table.values.workspaceTree,
						copy.table.values.workContext,
					],
				},
			],
		},
		{
			title: copy.table.categories.content.title,
			features: [
				{
					name: copy.table.categories.content.features.resources,
					values: [
						copy.table.values.mixedContent,
						copy.table.values.richTextDocuments,
					],
				},
				{
					name: copy.table.categories.content.features.workspaceScope,
					values: [
						copy.table.values.workspaceContent,
						copy.table.values.productPlanning,
					],
				},
			],
		},
		{
			title: copy.table.categories.extensions.title,
			features: [
				{
					name: copy.table.categories.extensions.features.customization,
					values: [
						copy.table.values.nativeExtensions,
						copy.table.values.integrations,
					],
				},
				{
					name: copy.table.categories.extensions.features.customTools,
					values: [
						copy.table.values.privateExtensions,
						copy.table.values.apiApps,
					],
				},
			],
		},
	];

	const sources = [
		{
			href: "https://linear.app/docs/documents",
			label: copy.sources.documents,
		},
		{
			href: "https://linear.app/docs/workspaces",
			label: copy.sources.workspaces,
		},
		{
			href: "https://linear.app/docs/integration-directory",
			label: copy.sources.integrations,
		},
		{
			href: "https://linear.app/developers/sdk",
			label: copy.sources.api,
		},
	];

	return (
		<ProductComparison
			analyticsId="linear_comparison"
			copy={copy}
			groups={groups}
			products={products}
			sources={sources}
		/>
	);
}
