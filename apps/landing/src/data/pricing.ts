import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { localePath } from "@/i18n/locale-path";

export type Plan = {
	id: "business" | "enterprise" | "free" | "plus";
	name: string;
	price: { monthly: string; yearly: string };
	period?: { monthly: string; yearly: string };
	subheadline: string;
	features: string[];
	ctaLabel: string;
	href: string;
	originalYearlyPrice?: string;
};

type PlanGroups = {
	all: Plan[];
};

type PlanFeatureValue = string | boolean;
type PlanFeatureValues = Record<Plan["id"], PlanFeatureValue>;

export type PlanComparisonGroup = {
	title: string;
	features: { name: string; values: PlanFeatureValues }[];
};

export function getPlans(dict: Dictionary, locale: Locale): PlanGroups {
	const { free, plus, business, enterprise } = dict.pricing.plans;

	const freePlan: Plan = {
		id: "free",
		name: free.name,
		price: { monthly: "$0", yearly: "$0" },
		subheadline: free.subheadline,
		features: free.features,
		ctaLabel: free.ctaLabel,
		href: "https://web.lunaris.app",
	};

	const plusPlan: Plan = {
		id: "plus",
		name: plus.name,
		price: { monthly: "$10", yearly: "$8" },
		period: {
			monthly: dict.pricingPage.labels.perMemberMonth,
			yearly: dict.pricingPage.labels.perMemberMonth,
		},
		originalYearlyPrice: "$10",
		subheadline: plus.subheadline,
		features: plus.features,
		ctaLabel: plus.ctaLabel,
		href: "https://web.lunaris.app",
	};

	const businessPlan: Plan = {
		id: "business",
		name: business.name,
		price: { monthly: "$20", yearly: "$16" },
		period: {
			monthly: dict.pricingPage.labels.perMemberMonth,
			yearly: dict.pricingPage.labels.perMemberMonth,
		},
		originalYearlyPrice: "$20",
		subheadline: business.subheadline,
		features: business.features,
		ctaLabel: business.ctaLabel,
		href: "https://web.lunaris.app",
	};

	const enterprisePlan: Plan = {
		id: "enterprise",
		name: enterprise.name,
		price: { monthly: "Custom", yearly: "Custom" },
		subheadline: enterprise.subheadline,
		features: enterprise.features,
		ctaLabel: enterprise.ctaLabel,
		href: localePath(locale, "/demo"),
	};

	return {
		all: [freePlan, plusPlan, businessPlan, enterprisePlan],
	};
}

export function getPlanComparison(dict: Dictionary): PlanComparisonGroup[] {
	const { comparisonTable, labels, storage } = dict.pricingPage;
	const { core, extensions, support, securityCompliance } =
		comparisonTable.categories;
	const { unlimited } = labels;

	function byPlan(
		free: PlanFeatureValue,
		plus: PlanFeatureValue,
		business: PlanFeatureValue,
		enterprise: PlanFeatureValue,
	): PlanFeatureValues {
		return { free, plus, business, enterprise };
	}

	const included = byPlan(true, true, true, true);
	const businessAndEnterprise = byPlan(false, false, true, true);
	const enterpriseOnly = byPlan(false, false, false, true);

	return [
		{
			title: core.title,
			features: [
				{
					name: core.features.workspaces,
					values: byPlan(unlimited, unlimited, unlimited, unlimited),
				},
				{
					name: core.features.items,
					values: byPlan("25", unlimited, unlimited, unlimited),
				},
				{
					name: core.features.members,
					values: byPlan("3", "10", unlimited, unlimited),
				},
				{
					name: storage.poolLabel,
					values: storage.pools,
				},
				{
					name: storage.fileLabel,
					values: storage.files,
				},
				{ name: core.features.cloudSync, values: included },
			],
		},
		{
			title: extensions.title,
			features: [
				{ name: extensions.features.richTextEditor, values: included },
				{ name: extensions.features.whiteboard, values: included },
				{ name: extensions.features.kanbanBoard, values: included },
				{ name: extensions.features.compiler, values: included },
				{ name: extensions.features.allOther, values: businessAndEnterprise },
			],
		},
		{
			title: support.title,
			features: [
				{ name: support.features.community, values: included },
				{ name: support.features.priority, values: businessAndEnterprise },
				{ name: support.features.dedicated, values: enterpriseOnly },
			],
		},
		{
			title: securityCompliance.title,
			features: [
				{
					name: securityCompliance.features.customRoles,
					values: enterpriseOnly,
				},
				{ name: securityCompliance.features.sla, values: enterpriseOnly },
				{ name: securityCompliance.features.sso, values: enterpriseOnly },
				{ name: securityCompliance.features.soc2, values: enterpriseOnly },
			],
		},
	];
}
