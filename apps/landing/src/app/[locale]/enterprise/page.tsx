import {
	GlobalIcon,
	HugeiconsIcon,
	Key01Icon,
	Shield01Icon,
	UserAdd01Icon,
	UserShieldIcon,
} from "@lunarisapp/ui/icons";
import type { Metadata } from "next";
import Link from "next/link";
import {
	TrackedButtonLink,
	TrackedSoftButtonLink,
} from "@/components/analytics/tracked-button-link";
import { Container } from "@/components/elements/container";
import { EnterpriseArtwork } from "@/components/elements/enterprise-artwork";
import { ExtensionsArtwork } from "@/components/elements/extensions-artwork";
import { Heading } from "@/components/elements/heading";
import { Subheading } from "@/components/elements/subheading";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { Faq } from "@/components/sections/faqs-accordion";
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

const bodyClass = "text-pretty text-base/7 text-olive-700 dark:text-olive-300";
const iconClass = "size-6 text-olive-700 dark:text-olive-400";
const policyHeadingClass =
	"mt-4 text-balance font-display text-3xl/9 tracking-tight sm:text-4xl/10";
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
		{ ...copy.sso, icon: Key01Icon },
		{ ...copy.scim, icon: UserAdd01Icon },
		{
			title: securityCompliance.features.customRoles,
			description: copy.roles,
			icon: UserShieldIcon,
		},
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
		<Container>
			<section
				aria-labelledby="enterprise-heading"
				className="grid items-center gap-9 pt-12 pb-10 sm:gap-12 sm:pt-16 sm:pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-20 lg:pb-14"
			>
				<div>
					<Heading
						className="max-w-[13ch] text-[2.625rem]/none xl:text-7xl/none"
						id="enterprise-heading"
					>
						{copy.headline}
					</Heading>
					<p className={`${bodyClass} mt-5 max-w-md sm:text-lg/8`}>
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
							<ArrowNarrowRightIcon className="shrink-0" />
						</TrackedSoftButtonLink>
					</div>
				</div>
				<EnterpriseArtwork />
			</section>

			<div className="grid overflow-hidden rounded-2xl border border-current/10 bg-olive-950/[.025] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] dark:bg-white/[.045]">
				<section
					aria-labelledby="enterprise-security"
					className="px-5 py-6 sm:p-8 lg:p-10"
				>
					<HugeiconsIcon
						aria-hidden="true"
						className={iconClass}
						icon={Shield01Icon}
					/>
					<h2 className={policyHeadingClass} id="enterprise-security">
						{securityCompliance.title}
					</h2>
					<p className={`${bodyClass} mt-3 max-w-xl`}>
						{copy.security.description}
					</p>
					<div className="mt-2 flex flex-wrap gap-x-6">
						<a className={textLinkClass} href={`${trustCenterUrl}/documents`}>
							{copy.security.documents}
							<ArrowNarrowRightIcon className="shrink-0" />
						</a>
						<a className={textLinkClass} href={legalDocumentUrls.subprocessors}>
							{dict.footer.subprocessors}
							<ArrowNarrowRightIcon className="shrink-0" />
						</a>
					</div>
				</section>
				<section
					aria-labelledby="enterprise-residency"
					className="border-t border-current/10 px-5 py-6 sm:p-8 lg:border-t-0 lg:border-l lg:p-10"
				>
					<HugeiconsIcon
						aria-hidden="true"
						className={iconClass}
						icon={GlobalIcon}
					/>
					<h2 className={policyHeadingClass} id="enterprise-residency">
						{copy.residency.title}
					</h2>
					<p className={`${bodyClass} mt-3 max-w-md`}>
						{copy.residency.description}
					</p>
				</section>
			</div>

			<section
				aria-labelledby="enterprise-access"
				className="pt-14 pb-10 sm:pt-20 sm:pb-14"
			>
				<Subheading className="max-w-xl text-balance" id="enterprise-access">
					{copy.access}
				</Subheading>
				<dl className="mt-5 grid divide-y divide-current/10 border-y border-current/10 sm:mt-7 md:grid-cols-3 md:divide-x md:divide-y-0">
					{accessControls.map(({ title, description, icon }) => (
						<div
							className="py-5 md:px-5 md:py-6 md:first:pl-0 md:last:pr-0 lg:px-8"
							key={title}
						>
							<dt className="flex items-start gap-3 text-lg/6 font-medium md:flex-col">
								<HugeiconsIcon
									aria-hidden="true"
									className={`${iconClass} shrink-0`}
									icon={icon}
								/>
								{title}
							</dt>
							<dd className={`${bodyClass} mt-2`}>{description}</dd>
						</div>
					))}
				</dl>
				<div className="mt-1 flex md:justify-end">
					<Link
						className={textLinkClass}
						href={localePath(locale, "/pricing#compare-plans")}
					>
						{homepageCopy[locale].pricing}
						<ArrowNarrowRightIcon className="shrink-0" />
					</Link>
				</div>
			</section>

			<section
				aria-labelledby="enterprise-extensions"
				className="grid items-center gap-6 pb-14 sm:gap-8 sm:pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12"
			>
				<div>
					<Subheading className="text-balance" id="enterprise-extensions">
						{copy.extensions.title}
					</Subheading>
					<p className={`${bodyClass} mt-4 max-w-md`}>
						{copy.extensions.description}
					</p>
					<a className={`${textLinkClass} mt-2`} href={extensionQuickstartUrl}>
						{dict.nav.extensionsSdk}
						<ArrowNarrowRightIcon className="shrink-0" />
					</a>
				</div>
				<ExtensionsArtwork />
			</section>

			<section
				aria-labelledby="enterprise-faq-heading"
				className="grid gap-4 border-t border-current/10 py-12 sm:gap-6 sm:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12"
				id="enterprise-faq"
			>
				<Subheading className="text-balance" id="enterprise-faq-heading">
					{dict.faqs.headline}
				</Subheading>
				<div className="divide-y divide-current/10 border-y border-current/10">
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
									<ArrowNarrowRightIcon className="shrink-0" />
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
				</div>
			</section>

			<section
				aria-labelledby="enterprise-rollout"
				className="mb-12 grid items-center gap-5 rounded-2xl bg-olive-950/5 px-5 py-7 sm:mb-16 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10 lg:p-10 dark:bg-white/[.075]"
			>
				<div>
					<Subheading className="text-balance" id="enterprise-rollout">
						{copy.consultation.title}
					</Subheading>
					<p className={`${bodyClass} mt-3 max-w-xl`}>
						{copy.consultation.description}
					</p>
				</div>
				<div>{consultationLink("enterprise_bottom")}</div>
			</section>
		</Container>
	);
}
