import type { Metadata } from "next";
import Link from "next/link";
import { TrackedButtonLink } from "@/components/analytics/tracked-button-link";
import { Container } from "@/components/elements/container";
import { DemoVideo } from "@/components/elements/demo-video";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { homepageCopy } from "@/data/homepage";
import { repositoryUrl } from "@/data/open-source";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/locale-path";

/*
 * THESIS: A shared home for small-team knowledge, with extensions and offline access.
 * OWN-WORLD: Existing olive paper, Instrument Serif claims, Inter explanations, pill actions.
 * STORY: Understand notes and knowledge bases; see the real workspace; start free.
 * FIRST VIEWPORT: Left-aligned two-line claim, right-hand explanation and CTA, wide product tour.
 * FORM: Product-led editorial cover; surface candidate 7; seed cde4d312.
 * FINISH: Verify desktop/mobile, interactions, accessibility, and recorded design guidance.
 */
export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const copy = homepageCopy[locale as Locale];
	return { title: copy.metaTitle, description: copy.metaDescription };
}

export default async function Page({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = homepageCopy[locale];
	const dict = await getDictionary(locale);

	return (
		<>
			<section
				aria-labelledby="home-heading"
				className="pt-10 sm:pt-16 lg:pt-18"
				id="hero"
			>
				<Container>
					<div className="grid items-end gap-7 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
						<h1
							className="max-w-3xl font-display text-[clamp(3.25rem,6vw,5.25rem)] leading-[1.02] tracking-tight text-balance text-olive-950 dark:text-olive-100"
							id="home-heading"
						>
							{copy.headline}{" "}
							<span className="block text-olive-600 dark:text-olive-400">
								{copy.headlineEnd}
							</span>
						</h1>
						<div className="max-w-md lg:pb-1">
							<p className="text-base/7 text-pretty text-olive-700 sm:text-lg/8 dark:text-olive-300">
								{copy.description}
							</p>
							<div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
								<TrackedButtonLink
									analyticsProperties={{
										cta: "open_web_app",
										destination: "web",
										location: "home_hero",
									}}
									className="min-h-12 gap-3 px-6"
									href="https://web.lunaris.app"
									size="lg"
								>
									{copy.start}
									<ArrowNarrowRightIcon />
								</TrackedButtonLink>
								<a
									className="inline-flex min-h-11 items-center gap-2 text-sm/6 font-medium text-olive-700 underline-offset-4 hover:underline dark:text-olive-300"
									href="#workspace-demo"
								>
									{copy.watch}
									<svg
										aria-hidden="true"
										className="size-4"
										fill="none"
										stroke="currentColor"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										viewBox="0 0 24 24"
									>
										<path d="M12 4v16m-6-6 6 6 6-6" />
									</svg>
								</a>
							</div>
							<p className="mt-3 text-xs/5 text-olive-600 dark:text-olive-400">
								{copy.freeNote}
							</p>
						</div>
					</div>
					<div className="mt-10 scroll-mt-28 sm:mt-12" id="workspace-demo">
						<DemoVideo
							autoPlay={false}
							chapters={copy.chapters}
							chapterNavigationLabel={copy.tour}
							description={dict.accessibility.demoVideoDescription}
							label={dict.accessibility.demoVideo}
						/>
						<p className="mt-4 text-center text-sm/6 text-olive-600 dark:text-olive-400">
							{copy.tourCaption}
						</p>
					</div>
				</Container>
			</section>

			<section
				aria-labelledby="benefits-heading"
				className="py-14 sm:py-20"
				id="platform"
			>
				<Container>
					<h2
						className="max-w-2xl font-display text-3xl/9 tracking-tight text-balance text-olive-950 sm:text-4xl/11 dark:text-olive-100"
						id="benefits-heading"
					>
						{copy.benefitsTitle}
					</h2>
					<div className="mt-8 grid gap-8 sm:mt-10 lg:grid-cols-3 lg:gap-12">
						{copy.benefits.map((benefit) => (
							<div
								className="border-t border-olive-950/15 pt-5 dark:border-white/20"
								key={benefit.title}
							>
								<h3 className="text-base/7 font-semibold text-olive-950 dark:text-olive-100">
									{benefit.title}
								</h3>
								<p className="mt-2 max-w-md text-sm/7 text-pretty text-olive-700 dark:text-olive-300">
									{benefit.description}
								</p>
							</div>
						))}
					</div>
				</Container>
			</section>

			<section
				aria-labelledby="ownership-heading"
				className="bg-olive-200/65 py-10 sm:py-12 dark:bg-olive-900"
				id="your-workspace"
			>
				<Container className="grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
					<h2
						className="max-w-sm font-display text-4xl/11 tracking-tight text-balance text-olive-950 sm:text-5xl/13 dark:text-olive-100"
						id="ownership-heading"
					>
						{copy.ownershipTitle}
					</h2>
					<div>
						<p className="max-w-xl text-base/7 text-pretty text-olive-700 dark:text-olive-300">
							{copy.ownershipDescription}
						</p>
						<div className="mt-4 flex flex-wrap gap-x-7 gap-y-1 text-sm/6 font-medium text-olive-950 dark:text-olive-100">
							<Link
								className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
								href={localePath(locale, "/self-hosted")}
							>
								{copy.selfHost}
								<ArrowNarrowRightIcon />
							</Link>
							<a
								className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
								href={repositoryUrl}
							>
								{copy.source}
								<ArrowNarrowRightIcon />
							</a>
						</div>
					</div>
				</Container>
			</section>

			<section
				aria-labelledby="faq-heading"
				className="py-14 sm:py-20"
				id="faqs"
			>
				<Container className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
					<div>
						<h2
							className="font-display text-3xl/9 tracking-tight text-balance text-olive-950 sm:text-4xl/11 dark:text-olive-100"
							id="faq-heading"
						>
							{copy.faqTitle}
						</h2>
						<p className="mt-3 text-sm/7 text-olive-700 dark:text-olive-300">
							{copy.faqDescription}
						</p>
						<Link
							className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm/6 font-medium text-olive-950 underline-offset-4 hover:underline dark:text-olive-100"
							href={localePath(locale, "/pricing")}
						>
							{copy.pricing}
							<ArrowNarrowRightIcon />
						</Link>
					</div>
					<div className="divide-y divide-olive-950/15 border-y border-olive-950/15 dark:divide-white/20 dark:border-white/20">
						{copy.faqs.map((faq) => (
							<details className="group" key={faq.title}>
								<summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-sm/7 font-medium text-olive-950 [&::-webkit-details-marker]:hidden dark:text-olive-100">
									{faq.title}
									<svg
										aria-hidden="true"
										className="size-4 shrink-0"
										fill="none"
										stroke="currentColor"
										strokeLinecap="round"
										strokeWidth={1.5}
										viewBox="0 0 16 16"
									>
										<path d="M3 8h10" />
										<path className="group-open:hidden" d="M8 3v10" />
									</svg>
								</summary>
								<p className="max-w-xl pr-8 pb-5 text-sm/7 text-olive-700 dark:text-olive-300">
									{faq.description}
								</p>
							</details>
						))}
					</div>
				</Container>
			</section>

			<section
				aria-labelledby="closing-heading"
				className="border-t border-olive-950/10 py-12 sm:py-16 dark:border-white/15"
			>
				<Container className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center lg:gap-12">
					<div>
						<h2
							className="max-w-2xl font-display text-4xl/11 tracking-tight text-balance text-olive-950 sm:text-5xl/13 dark:text-olive-100"
							id="closing-heading"
						>
							{copy.closingTitle}
						</h2>
						<p className="mt-3 text-sm/7 text-olive-700 dark:text-olive-300">
							{copy.closingDescription}
						</p>
					</div>
					<TrackedButtonLink
						analyticsProperties={{
							cta: "open_web_app",
							destination: "web",
							location: "home_bottom",
						}}
						className="min-h-12 gap-3 px-6"
						href="https://web.lunaris.app"
						size="lg"
					>
						{copy.start}
						<ArrowNarrowRightIcon />
					</TrackedButtonLink>
				</Container>
			</section>
		</>
	);
}
