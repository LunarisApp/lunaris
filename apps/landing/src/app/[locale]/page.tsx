import type { Metadata } from "next";
import Link from "next/link";
import { TrackedButtonLink } from "@/components/analytics/tracked-button-link";
import { DesktopDownload } from "@/components/downloads/desktop-download";
import { Container } from "@/components/elements/container";
import { DemoVideo } from "@/components/elements/demo-video";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { HomeFeatures } from "@/components/sections/home-features";
import { homepageCopy } from "@/data/homepage";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/locale-path";

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
				className="pb-16 sm:pb-20 lg:pb-24"
				id="hero"
			>
				<div className="lunar-cover dark">
					<Container>
						<h1
							className="max-w-[18ch] font-hero text-[clamp(3.35rem,7.1vw,6rem)] leading-[0.94] tracking-[-0.035em] text-balance text-white"
							id="home-heading"
						>
							{copy.headline}{" "}
							<span className="block text-neutral-200 italic">
								{copy.headlineEnd}
							</span>
						</h1>
						<div className="mt-4 max-w-lg">
							<p className="text-base/6 text-pretty text-neutral-200 sm:text-lg/7">
								{copy.description}
							</p>
							<DesktopDownload
								locale={locale}
								downloadLabel={copy.downloadFor}
								fallbackLabel={`${copy.download} Lunaris`}
								allPlatformsLabel={copy.allPlatforms}
							>
								<TrackedButtonLink
									analyticsProperties={{
										cta: "open_web_app",
										destination: "web",
										location: "home_hero",
									}}
									className="min-h-11 gap-2 px-4 focus-visible:outline-2 focus-visible:outline-offset-4 sm:px-5"
									href="https://web.lunaris.app"
									size="lg"
								>
									{copy.start}
									<ArrowNarrowRightIcon />
								</TrackedButtonLink>
							</DesktopDownload>
						</div>
					</Container>
				</div>
				<Container>
					<div className="relative -mt-6 sm:-mt-10" id="workspace-demo">
						<DemoVideo
							autoPlay={false}
							chapters={copy.chapters}
							chapterNavigationLabel={copy.tour}
							description={dict.accessibility.demoVideoDescription}
							label={dict.accessibility.demoVideo}
						/>
					</div>
				</Container>
			</section>

			<HomeFeatures locale={locale} dictionary={dict} />

			<section
				aria-labelledby="faq-heading"
				className="py-16 sm:py-24"
				id="faqs"
			>
				<Container className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
					<div>
						<h2
							className="max-w-[12ch] font-display text-5xl/none tracking-tight text-balance text-olive-950 sm:text-6xl/none dark:text-olive-100"
							id="faq-heading"
						>
							{copy.faqTitle}
						</h2>
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
								<summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-base/7 font-medium text-olive-950 [&::-webkit-details-marker]:hidden dark:text-olive-100">
									{faq.title}
									<svg
										aria-hidden="true"
										className="size-7 shrink-0 p-1.5"
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
				className="border-t border-olive-950/10 py-16 text-olive-950 dark:border-white/10 dark:text-white sm:py-24"
			>
				<Container className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center lg:gap-12">
					<div>
						<h2
							className="max-w-[18ch] font-display text-5xl/none tracking-tight text-balance sm:text-7xl/none"
							id="closing-heading"
						>
							{copy.closingTitle}
						</h2>
						<p className="mt-4 max-w-md text-base/7">
							{copy.closingDescription}
						</p>
					</div>
					<TrackedButtonLink
						analyticsProperties={{
							cta: "open_web_app",
							destination: "web",
							location: "home_bottom",
						}}
						className="min-h-12 w-full gap-3 px-6 sm:w-auto"
						color="dark/light"
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
