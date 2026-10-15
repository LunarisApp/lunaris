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
	const copy = dict.obsidianComparisonPage;
	const products: [ComparisonProduct, ComparisonProduct] = [
		{ id: "lunaris", name: copy.table.lunaris },
		{ id: "obsidian", name: copy.table.obsidian },
	];

	const groups: ComparisonGroup[] = [
		{
			title: copy.table.categories.collaboration.title,
			features: [
				{
					name: copy.table.categories.collaboration.features.sameDocument,
					values: [
						copy.table.values.sharedEditing,
						copy.table.values.noLiveEditing,
					],
				},
				{
					name: copy.table.categories.collaboration.features.concurrentChanges,
					values: [copy.table.values.crdtMerge, copy.table.values.syncMerge],
				},
			],
		},
		{
			title: copy.table.categories.teamwork.title,
			features: [
				{
					name: copy.table.categories.teamwork.features.teamAccess,
					values: [
						copy.table.values.organizationInvite,
						copy.table.values.syncSubscription,
					],
				},
				{
					name: copy.table.categories.teamwork.features.permissions,
					values: [
						copy.table.values.organizationRoles,
						copy.table.values.samePermissions,
					],
				},
			],
		},
		{
			title: copy.table.categories.foundation.title,
			features: [
				{
					name: copy.table.categories.foundation.features.offlineModel,
					values: [
						copy.table.values.offlineOrganization,
						copy.table.values.localVault,
					],
				},
				{
					name: copy.table.categories.foundation.features.organizationShape,
					values: [
						copy.table.values.extensionOrganization,
						copy.table.values.markdownPlugins,
					],
				},
			],
		},
	];

	const sources = [
		{
			href: "https://obsidian.md/help/sync/collaborate",
			label: copy.sources.collaboration,
		},
		{
			href: "https://obsidian.md/help/teams/sync",
			label: copy.sources.teams,
		},
		{
			href: "https://obsidian.md/help/sync/plans",
			label: copy.sources.plans,
		},
	];

	return (
		<ProductComparison
			analyticsId="obsidian_comparison"
			copy={copy}
			groups={groups}
			products={products}
			sources={sources}
		/>
	);
}
