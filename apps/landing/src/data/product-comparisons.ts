import type { ProductIconName } from "@/components/elements/product-icon";
import type { Dictionary } from "@/i18n/dictionaries/types";

export type ComparisonGroup = {
	title: string;
	features: readonly {
		name: string;
		values: readonly [string, string];
	}[];
};

export type ComparisonProduct = {
	id: ProductIconName;
	name: string;
};

export function getLinearComparison(dict: Dictionary) {
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

	return { copy, products, groups, sources };
}

export function getNotionComparison(dict: Dictionary) {
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

	return { copy, products, groups, sources };
}

export function getObsidianComparison(dict: Dictionary) {
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

	return { copy, products, groups, sources };
}
