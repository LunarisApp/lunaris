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
