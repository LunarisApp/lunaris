import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { localePath } from "@/i18n/locale-path";

type Plan = {
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

export function getPlanComparison(dict: Dictionary) {
	const { free, plus, business, enterprise } = dict.pricing.plans;
	const { comparisonTable, labels, storage } = dict.pricingPage;
	const { core, extensions, support, securityCompliance } =
		comparisonTable.categories;
	const { unlimited } = labels;

	function byPlan<T extends string | boolean>(
		freeValue: T,
		plusValue: T,
		businessValue: T,
		enterpriseValue: T,
	) {
		return {
			[free.name]: freeValue,
			[plus.name]: plusValue,
			[business.name]: businessValue,
			[enterprise.name]: enterpriseValue,
		};
	}

	const businessAndEnterprise = byPlan(false, false, true, true);
	const enterpriseOnly = byPlan(false, false, false, true);

	return [
		{
			title: core.title,
			features: [
				{ name: core.features.workspaces, value: unlimited },
				{
					name: core.features.items,
					value: byPlan("25", unlimited, unlimited, unlimited),
				},
				{
					name: core.features.members,
					value: byPlan("3", "10", unlimited, unlimited),
				},
				{
					name: storage.poolLabel,
					value: byPlan(
						storage.pools.free,
						storage.pools.plus,
						storage.pools.business,
						storage.pools.enterprise,
					),
				},
				{
					name: storage.fileLabel,
					value: byPlan(
						storage.files.free,
						storage.files.plus,
						storage.files.business,
						storage.files.enterprise,
					),
				},
				{ name: core.features.cloudSync, value: true },
			],
		},
		{
			title: extensions.title,
			features: [
				{ name: extensions.features.richTextEditor, value: true },
				{ name: extensions.features.whiteboard, value: true },
				{ name: extensions.features.kanbanBoard, value: true },
				{ name: extensions.features.compiler, value: true },
				{ name: extensions.features.allOther, value: businessAndEnterprise },
			],
		},
		{
			title: support.title,
			features: [
				{ name: support.features.community, value: true },
				{ name: support.features.priority, value: businessAndEnterprise },
				{ name: support.features.dedicated, value: enterpriseOnly },
			],
		},
		{
			title: securityCompliance.title,
			features: [
				{
					name: securityCompliance.features.customRoles,
					value: enterpriseOnly,
				},
				{ name: securityCompliance.features.sla, value: enterpriseOnly },
				{ name: securityCompliance.features.sso, value: enterpriseOnly },
				{ name: securityCompliance.features.soc2, value: enterpriseOnly },
			],
		},
	];
}
