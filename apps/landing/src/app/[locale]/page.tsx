import Link from "next/link";
import { TrackedButtonLink } from "@/components/analytics/tracked-button-link";
import { DemoVideo } from "@/components/elements/demo-video";
import { Screenshot } from "@/components/elements/screenshot";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { CallToActionSimple } from "@/components/sections/call-to-action-simple";
import {
	FAQsTwoColumnAccordion,
	Faq,
} from "@/components/sections/faqs-two-column-accordion";
import { FeaturesBentoGrid } from "@/components/sections/features-bento-grid";
import {
	Features,
	FeatureThreeColumnWithDemos,
} from "@/components/sections/features-three-column-with-demos";
import { HeroCenteredWithDemo } from "@/components/sections/hero-centered-with-demo";
import { ProblemIllustration } from "@/components/sections/problem-illustration";
import { getFaqs } from "@/data/faqs";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/locale-path";

export default async function Page({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);
	const faqs = getFaqs(locale, dict);
	const ctaClassName =
		"min-h-12 max-w-full flex-wrap gap-x-2 gap-y-0 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-950 dark:focus-visible:outline-olive-200";

	return (
		<>
			<HeroCenteredWithDemo
				cta={
					<TrackedButtonLink
						analyticsProperties={{
							cta: "open_web_app",
							destination: "web",
							location: "home_hero",
						}}
						className={ctaClassName}
						href="https://web.lunaris.app"
						size="lg"
					>
						<span>{dict.cta.label}</span>
						<span className="font-normal opacity-80">
							<span aria-hidden="true">· </span>
							{dict.cta.suffix}
						</span>
					</TrackedButtonLink>
				}
				demo={
					<DemoVideo
						label={dict.accessibility.demoVideo}
						description={dict.accessibility.demoVideoDescription}
					/>
				}
				eyebrow={
					<Link
						className="group inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-olive-950/10 bg-white/50 py-1 pr-3 pl-1 text-sm/6 font-medium text-olive-800 shadow-sm transition-colors hover:border-olive-950/15 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-950 dark:border-white/15 dark:bg-white/10 dark:text-olive-200 dark:focus-visible:outline-olive-200 dark:hover:border-white/25 dark:hover:bg-white/15"
						href={localePath(locale, "/mcp")}
					>
						<span className="shrink-0 rounded-full bg-olive-950 px-2 py-0.5 text-xs/5 font-semibold text-white dark:bg-olive-100 dark:text-olive-950">
							{dict.hero.mcpAnnouncement.badge}
						</span>
						<span className="min-w-0 text-left text-pretty">
							{dict.hero.mcpAnnouncement.label}
						</span>
						<ArrowNarrowRightIcon className="shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
					</Link>
				}
				headline={dict.hero.headline}
				id="hero"
				subheadline={
					<p className="text-pretty">
						{dict.hero.subheadline.beforeHighlight}{" "}
						<strong className="font-medium text-olive-950 dark:text-white">
							{dict.hero.subheadline.highlight}
						</strong>{" "}
						{dict.hero.subheadline.betweenHighlights}{" "}
						<strong className="font-medium text-olive-950 dark:text-white">
							{dict.hero.subheadline.secondHighlight}
						</strong>
						{dict.hero.subheadline.afterHighlight}
					</p>
				}
			/>

			{/* Problems */}
			<Features
				features={
					<>
						<FeatureThreeColumnWithDemos
							demo={
								<Screenshot placement="bottom-left" wallpaper="blue">
									<ProblemIllustration kind="featureBloat" />
								</Screenshot>
							}
							headline={dict.problems.items.featureBloat.headline}
							subheadline={
								<p>{dict.problems.items.featureBloat.subheadline}</p>
							}
						/>
						<FeatureThreeColumnWithDemos
							demo={
								<Screenshot placement="top" wallpaper="purple">
									<ProblemIllustration kind="vendorLockIn" />
								</Screenshot>
							}
							headline={dict.problems.items.vendorLockIn.headline}
							subheadline={
								<p>{dict.problems.items.vendorLockIn.subheadline}</p>
							}
						/>
						<FeatureThreeColumnWithDemos
							demo={
								<Screenshot placement="bottom-right" wallpaper="green">
									<ProblemIllustration kind="rigidWorkflows" />
								</Screenshot>
							}
							headline={dict.problems.items.rigidWorkflows.headline}
							subheadline={
								<p>{dict.problems.items.rigidWorkflows.subheadline}</p>
							}
						/>
					</>
				}
				headline={dict.problems.headline}
				id="problems"
				subheadline={<p>{dict.problems.subheadline}</p>}
			/>

			{/* Platform features */}
			<FeaturesBentoGrid
				features={dict.bentoFeatures.items}
				headline={dict.bentoFeatures.headline}
				id="platform"
				subheadline={<p>{dict.bentoFeatures.subheadline}</p>}
			/>

			{/* FAQs */}
			<FAQsTwoColumnAccordion headline={dict.faqs.headline} id="faqs">
				{faqs.map((faq) => (
					<Faq
						answer={faq.answer}
						id={faq.id}
						key={faq.id}
						question={faq.question}
					/>
				))}
			</FAQsTwoColumnAccordion>

			{/* Call To Action */}
			<CallToActionSimple
				className="border-t border-olive-950/10 dark:border-white/10"
				cta={
					<TrackedButtonLink
						analyticsProperties={{
							cta: "open_web_app",
							destination: "web",
							location: "home_bottom",
						}}
						className={`${ctaClassName} self-start`}
						href="https://web.lunaris.app"
						size="lg"
					>
						<span>{dict.cta.label}</span>
						<span className="font-normal opacity-80">
							<span aria-hidden="true">· </span>
							{dict.cta.suffix}
						</span>
					</TrackedButtonLink>
				}
				headline={dict.cta.headline}
				subheadline={<p>{dict.cta.subheadline}</p>}
			/>
		</>
	);
}
