import type { Metadata } from "next";
import Link from "next/link";
import {
	TrackedButtonLink,
	TrackedSoftButtonLink,
} from "@/components/analytics/tracked-button-link";
import { Container } from "@/components/elements/container";
import { Heading } from "@/components/elements/heading";
import { WorkspaceArtwork } from "@/components/elements/workspace-artwork";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { CallToActionSimpleCentered } from "@/components/sections/call-to-action-simple-centered";
import { Faq, FAQsAccordion } from "@/components/sections/faqs-accordion";
import { enterpriseCopy } from "@/data/enterprise";
import { extensionQuickstartUrl } from "@/data/extensions";
import { homepageCopy } from "@/data/homepage";
import { openSourceCopy } from "@/data/open-source";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/locale-path";
import { localizedAlternates } from "@/i18n/metadata";
import { legalDocumentUrls, trustCenterUrl } from "@/lib/legal-document-links";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = enterpriseCopy[locale];

	return {
		title: copy.headline,
		description: copy.description,
		alternates: localizedAlternates(locale, "/enterprise"),
	};
}

const bodyClass = "text-base/7 text-olive-700 dark:text-olive-300";
const actionClass =
	"min-h-11 focus-visible:outline-2 focus-visible:outline-offset-4";
const textLinkClass = `${actionClass} inline-flex items-center gap-2 rounded-sm text-sm/6 font-medium underline-offset-4 hover:underline`;

export default async function EnterprisePage({ params }: Props) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = enterpriseCopy[locale];
	const dict = await getDictionary(locale);
	const { securityCompliance } = dict.pricingPage.comparisonTable.categories;
	const { offline, aiTraining } = dict.faqs.items;
	const selfHosted = openSourceCopy[locale];
	const accessControls = [
		copy.sso,
		copy.scim,
		{ title: securityCompliance.features.customRoles, description: copy.roles },
	];

	function consultationLink(location: "enterprise_hero" | "enterprise_bottom") {
		return (
			<TrackedButtonLink
				analyticsProperties={{
					cta: "request_consultation",
					destination: "demo_request",
					location,
				}}
				className={actionClass}
				href={localePath(locale, "/demo")}
				size="lg"
			>
				{dict.demoPage.form.submit}
			</TrackedButtonLink>
		);
	}

	return (
		<>
			<Container>
				<section
					aria-labelledby="enterprise-heading"
					className="grid items-center gap-8 py-12 sm:gap-10 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20"
				>
					<div>
						<Heading className="max-w-[16ch]" id="enterprise-heading">
							{copy.headline}
						</Heading>
						<p
							className={`${bodyClass} mt-5 max-w-lg text-pretty sm:text-lg/8`}
						>
							{copy.description}
						</p>
						<div className="mt-7 flex flex-wrap items-center gap-3">
							{consultationLink("enterprise_hero")}
							<TrackedSoftButtonLink
								analyticsProperties={{
									cta: "open_trust_center",
									destination: "trust_center",
									location: "enterprise_hero",
								}}
								className={actionClass}
								href={trustCenterUrl}
								size="lg"
							>
								{dict.footer.trustCenter}
								<ArrowNarrowRightIcon />
							</TrackedSoftButtonLink>
						</div>
					</div>
					<WorkspaceArtwork kind="enterprise" />
				</section>

				<section
					aria-labelledby="enterprise-security"
					className="grid gap-x-16 gap-y-5 rounded-2xl border border-current/10 bg-olive-950/3 px-6 py-8 sm:p-10 lg:grid-cols-[1fr_1.5fr] dark:bg-white/[.045]"
				>
					<h2
						className="max-w-[20ch] text-balance text-3xl/9 tracking-tight sm:text-4xl/10"
						id="enterprise-security"
					>
						{securityCompliance.title}
					</h2>
					<div>
						<p className={bodyClass}>{copy.security.description}</p>
						<div className="mt-3 flex flex-wrap gap-x-6">
							<a className={textLinkClass} href={`${trustCenterUrl}/documents`}>
								{copy.security.documents}
								<ArrowNarrowRightIcon />
							</a>
							<a
								className={textLinkClass}
								href={legalDocumentUrls.subprocessors}
							>
								{dict.footer.subprocessors}
								<ArrowNarrowRightIcon />
							</a>
						</div>
					</div>
				</section>

				<section
					aria-labelledby="enterprise-access"
					className="grid gap-x-16 gap-y-6 py-10 sm:py-12 lg:grid-cols-[1fr_1.5fr]"
				>
					<h2
						className="max-w-[20ch] text-balance text-3xl/9 tracking-tight sm:text-4xl/10"
						id="enterprise-access"
					>
						{copy.access}
					</h2>
					<div>
						<dl className="divide-y divide-current/10">
							{accessControls.map(({ title, description }) => (
								<div
									className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_1.5fr] sm:gap-5"
									key={title}
								>
									<dt className="font-medium">{title}</dt>
									<dd className={bodyClass}>{description}</dd>
								</div>
							))}
						</dl>
						<Link
							className={`${textLinkClass} mt-3`}
							href={localePath(locale, "/pricing#compare-plans")}
						>
							{homepageCopy[locale].pricing}
							<ArrowNarrowRightIcon />
						</Link>
					</div>
				</section>

				<div className="grid gap-8 border-y border-current/10 py-10 sm:py-12 lg:grid-cols-2 lg:gap-16">
					<section aria-labelledby="enterprise-residency">
						<h2 className="text-2xl/8 font-medium" id="enterprise-residency">
							{copy.residency.title}
						</h2>
						<p className={`${bodyClass} mt-3 max-w-lg`}>
							{copy.residency.description}
						</p>
					</section>
					<section aria-labelledby="enterprise-extensions">
						<h2 className="text-2xl/8 font-medium" id="enterprise-extensions">
							{copy.extensions.title}
						</h2>
						<p className={`${bodyClass} mt-3 max-w-lg`}>
							{copy.extensions.description}
						</p>
						<a
							className={`${textLinkClass} mt-2`}
							href={extensionQuickstartUrl}
						>
							{dict.nav.extensionsSdk}
							<ArrowNarrowRightIcon />
						</a>
					</section>
				</div>
			</Container>

			<FAQsAccordion headline={dict.faqs.headline} id="enterprise-faq">
				<Faq
					id="enterprise-faq-self-hosted"
					question={copy.selfHostingQuestion}
					answer={
						<>
							<p>{selfHosted.selfHostDescription}</p>
							<Link
								className={textLinkClass}
								href={localePath(locale, "/self-hosted")}
							>
								{selfHosted.label}
								<ArrowNarrowRightIcon />
							</Link>
						</>
					}
				/>
				<Faq
					id="enterprise-faq-offline"
					question={offline.question}
					answer={<p>{offline.answer}</p>}
				/>
				<Faq
					id="enterprise-faq-ai-training"
					question={aiTraining.question}
					answer={<p>{aiTraining.answer}</p>}
				/>
			</FAQsAccordion>

			<CallToActionSimpleCentered
				cta={consultationLink("enterprise_bottom")}
				className="border-t border-current/10"
				headline={copy.consultation.title}
				subheadline={<p>{copy.consultation.description}</p>}
			/>
		</>
	);
}
