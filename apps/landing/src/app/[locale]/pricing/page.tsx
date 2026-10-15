import type { Metadata } from "next";
import {
	TrackedButtonLink,
	TrackedSoftButtonLink,
} from "@/components/analytics/tracked-button-link";
import { Container } from "@/components/elements/container";
import { CallToActionSimpleCentered } from "@/components/sections/call-to-action-simple-centered";
import { FAQsAccordion, Faq } from "@/components/sections/faqs-accordion";
import { PlanComparisonTable } from "@/components/sections/plan-comparison-table";
import {
	Plan,
	PricingHeroMultiTier,
} from "@/components/sections/pricing-hero-multi-tier";
import { getFaqs } from "@/data/faqs";
import { getPlans } from "@/data/pricing";
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
		title: dict.pricingPage.title,
		description: dict.pricingPage.description,
		alternates: localizedAlternates(locale, "/pricing"),
	};
}

export default async function Page({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);
	const faqs = getFaqs(locale, dict);
	const planGroups = getPlans(dict, locale);
	const ct = dict.pricingPage.comparisonTable;

	function renderPlanCard(
		plan: (typeof planGroups.all)[number],
		key: "monthly" | "yearly",
	) {
		const showOriginal = key === "yearly" && plan.originalYearlyPrice;
		return (
			<Plan
				badge={showOriginal ? dict.pricingPage.labels.save20 : undefined}
				cta={
					<TrackedSoftButtonLink
						analyticsProperties={{
							billing_period: key,
							cta: "select_plan",
							destination: plan.id === "enterprise" ? "demo_request" : "web",
							location: "pricing_card",
							plan: plan.id,
						}}
						className="w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-700 dark:focus-visible:outline-olive-200"
						href={plan.href}
						size="lg"
					>
						{plan.ctaLabel}
					</TrackedSoftButtonLink>
				}
				features={plan.features}
				key={plan.name}
				name={plan.name}
				period={plan.period?.[key]}
				price={
					showOriginal ? (
						<>
							<s className="text-base/6 font-normal text-olive-500 dark:text-olive-500">
								{plan.originalYearlyPrice}
							</s>{" "}
							{plan.price[key]}
						</>
					) : (
						plan.price[key]
					)
				}
				subheadline={<p>{plan.subheadline}</p>}
			/>
		);
	}

	function renderPlans(option: string) {
		const key =
			option === dict.pricingPage.options.monthly
				? "monthly"
				: ("yearly" as const);
		return (
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
				{planGroups.all.map((plan) => renderPlanCard(plan, key))}
			</div>
		);
	}

	const [free, plus, business, enterprise] = planGroups.all;

	return (
		<>
			{/* Hero */}
			<PricingHeroMultiTier
				footer={
					<div className="space-y-2 text-center text-sm/6 text-olive-700 dark:text-olive-400">
						<p>{dict.pricingPage.billingNote}</p>
						<p>{dict.pricingPage.storage.note}</p>
					</div>
				}
				headline={dict.pricingPage.headline}
				id="pricing"
				options={[
					dict.pricingPage.options.monthly,
					dict.pricingPage.options.yearly,
				]}
				plans={{
					[dict.pricingPage.options.monthly]: renderPlans(
						dict.pricingPage.options.monthly,
					),
					[dict.pricingPage.options.yearly]: renderPlans(
						dict.pricingPage.options.yearly,
					),
				}}
				subheadline={<p>{dict.pricingPage.subheadline}</p>}
			/>
			{/* Plan Comparison Table */}
			<PlanComparisonTable
				features={[
					{
						title: ct.categories.core.title,
						features: [
							{
								name: ct.categories.core.features.workspaces,
								value: {
									[free.name]: dict.pricingPage.labels.unlimited,
									[plus.name]: dict.pricingPage.labels.unlimited,
									[business.name]: dict.pricingPage.labels.unlimited,
									[enterprise.name]: dict.pricingPage.labels.unlimited,
								},
							},
							{
								name: ct.categories.core.features.items,
								value: {
									[free.name]: "25",
									[plus.name]: dict.pricingPage.labels.unlimited,
									[business.name]: dict.pricingPage.labels.unlimited,
									[enterprise.name]: dict.pricingPage.labels.unlimited,
								},
							},
							{
								name: ct.categories.core.features.members,
								value: {
									[free.name]: "3",
									[plus.name]: "10",
									[business.name]: dict.pricingPage.labels.unlimited,
									[enterprise.name]: dict.pricingPage.labels.unlimited,
								},
							},
							{
								name: dict.pricingPage.storage.poolLabel,
								value: {
									[free.name]: dict.pricingPage.storage.pools.free,
									[plus.name]: dict.pricingPage.storage.pools.plus,
									[business.name]: dict.pricingPage.storage.pools.business,
									[enterprise.name]: dict.pricingPage.storage.pools.enterprise,
								},
							},
							{
								name: dict.pricingPage.storage.fileLabel,
								value: {
									[free.name]: dict.pricingPage.storage.files.free,
									[plus.name]: dict.pricingPage.storage.files.plus,
									[business.name]: dict.pricingPage.storage.files.business,
									[enterprise.name]: dict.pricingPage.storage.files.enterprise,
								},
							},
							{
								name: ct.categories.core.features.cloudSync,
								value: {
									[free.name]: true,
									[plus.name]: true,
									[business.name]: true,
									[enterprise.name]: true,
								},
							},
						],
					},
					{
						title: ct.categories.extensions.title,
						features: [
							{
								name: ct.categories.extensions.features.richTextEditor,
								value: true,
							},
							{
								name: ct.categories.extensions.features.whiteboard,
								value: true,
							},
							{
								name: ct.categories.extensions.features.kanbanBoard,
								value: true,
							},
							{ name: ct.categories.extensions.features.compiler, value: true },
							{
								name: ct.categories.extensions.features.allOther,
								value: {
									[free.name]: false,
									[plus.name]: false,
									[business.name]: true,
									[enterprise.name]: true,
								},
							},
						],
					},
					{
						title: ct.categories.support.title,
						features: [
							{ name: ct.categories.support.features.community, value: true },
							{
								name: ct.categories.support.features.priority,
								value: {
									[free.name]: false,
									[plus.name]: false,
									[business.name]: true,
									[enterprise.name]: true,
								},
							},
							{
								name: ct.categories.support.features.dedicated,
								value: {
									[free.name]: false,
									[plus.name]: false,
									[business.name]: false,
									[enterprise.name]: true,
								},
							},
						],
					},
					{
						title: ct.categories.securityCompliance.title,
						features: [
							{
								name: ct.categories.securityCompliance.features.customRoles,
								value: {
									[free.name]: false,
									[plus.name]: false,
									[business.name]: false,
									[enterprise.name]: true,
								},
							},
							{
								name: ct.categories.securityCompliance.features.sla,
								value: {
									[free.name]: false,
									[plus.name]: false,
									[business.name]: false,
									[enterprise.name]: true,
								},
							},
							{
								name: ct.categories.securityCompliance.features.sso,
								value: {
									[free.name]: false,
									[plus.name]: false,
									[business.name]: false,
									[enterprise.name]: true,
								},
							},
							{
								name: ct.categories.securityCompliance.features.soc2,
								value: {
									[free.name]: false,
									[plus.name]: false,
									[business.name]: false,
									[enterprise.name]: true,
								},
							},
						],
					},
				]}
				heading={ct.heading}
				id="compare-plans"
				includedLabel={dict.pricingPage.labels.included}
				notIncludedLabel={dict.pricingPage.labels.notIncluded}
				plans={[free.name, plus.name, business.name, enterprise.name]}
			/>
			<section className="pb-16">
				<Container>
					<div className="grid gap-x-10 gap-y-8 rounded-xl bg-olive-950/2.5 p-6 ring-1 ring-olive-950/10 sm:grid-cols-2 sm:p-8 lg:grid-cols-3 dark:bg-white/5 dark:ring-white/10">
						{dict.pricingPage.details.map((detail) => (
							<div key={detail.title}>
								<h2 className="text-base/6 font-semibold text-olive-950 dark:text-white">
									{detail.title}
								</h2>
								<p className="mt-2 text-sm/6 text-olive-700 dark:text-olive-400">
									{detail.body}
								</p>
							</div>
						))}
					</div>
				</Container>
			</section>
			{/* FAQs */}
			<FAQsAccordion headline={dict.faqs.headline} id="faqs">
				{faqs.map((faq) => (
					<Faq
						answer={faq.answer}
						id={faq.id}
						key={faq.id}
						question={faq.question}
					/>
				))}
			</FAQsAccordion>
			{/* Call To Action */}
			<CallToActionSimpleCentered
				cta={
					<TrackedButtonLink
						analyticsProperties={{
							cta: "open_web_app",
							destination: "web",
							location: "pricing_bottom",
						}}
						href="https://web.lunaris.app"
						size="lg"
					>
						{dict.pricingPage.ctaLabel}
						<span className="font-light opacity-60">
							{" "}
							- {dict.pricingPage.ctaSuffix}
						</span>
					</TrackedButtonLink>
				}
				headline={dict.pricingPage.ctaHeadline}
				id="get-invite"
			/>
		</>
	);
}
