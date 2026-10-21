import type { Metadata } from "next";
import { ButtonLink, SoftButtonLink } from "@/components/elements/button";
import { Container } from "@/components/elements/container";
import { Heading } from "@/components/elements/heading";
import {
	openSourceCopy,
	repositoryUrl,
	selfHostCommand,
	selfHostingGuideUrl,
} from "@/data/open-source";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import { localizedAlternates } from "@/i18n/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await params;
	const copy = openSourceCopy[locale as Locale];
	return {
		title: `${copy.label} — Lunaris`,
		description: copy.selfHostDescription,
		alternates: localizedAlternates(locale as Locale, "/self-hosted"),
	};
}

export default async function SelfHostedPage({ params }: Props) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = openSourceCopy[locale];
	const linkClass =
		"min-h-11 max-w-full text-pretty focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-600 dark:focus-visible:outline-olive-300";

	return (
		<Container className="py-12 text-olive-950 sm:py-20 dark:text-white">
			<div className="mx-auto max-w-5xl">
				<div className="max-w-4xl">
					<Heading>{copy.selfHostHeadline}</Heading>
					<p className="mt-6 max-w-2xl text-lg/8 text-olive-700 dark:text-olive-300">
						{copy.selfHostDescription}
					</p>
					<div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
						<ButtonLink className={linkClass} href="#install" size="lg">
							{copy.install}
						</ButtonLink>
						<SoftButtonLink
							className={linkClass}
							href={repositoryUrl}
							size="lg"
						>
							{copy.github}
						</SoftButtonLink>
					</div>
				</div>

				<div className="mt-12 grid items-start gap-10 border-t border-olive-950/10 pt-10 sm:mt-16 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 dark:border-white/10">
					<section aria-labelledby="requirements">
						<h2 className="text-xl/7 font-medium" id="requirements">
							{copy.requirements}
						</h2>
						<ul className="mt-4 list-disc space-y-4 pl-5 text-base/7 text-olive-700 dark:text-olive-300">
							<li>{copy.server}</li>
							<li>{copy.docker}</li>
							<li>{copy.domain}</li>
						</ul>
					</section>
					<section
						aria-labelledby="install"
						className="min-w-0 rounded-2xl bg-olive-950/3 p-5 sm:p-8 dark:bg-white/5"
					>
						<h2
							className="scroll-mt-6 font-display text-3xl/9 text-balance"
							id="install"
						>
							{copy.install}
						</h2>
						<p className="mt-4 text-base/7 text-olive-700 dark:text-olive-300">
							{copy.installDescription}
						</p>
						<pre
							aria-labelledby="install"
							role="region"
							// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the overflowing install command.
							tabIndex={0}
							className="mt-6 overflow-x-auto overscroll-x-contain rounded-lg bg-olive-950 p-4 text-sm/7 text-olive-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive-600 sm:p-5 dark:bg-white/10 dark:focus-visible:outline-olive-300"
						>
							<code>{selfHostCommand}</code>
						</pre>
						<p className="mt-4 text-base/7 text-olive-700 dark:text-olive-300">
							{copy.nextStep}
						</p>
						<a
							className={`${linkClass} mt-3 inline-flex items-center underline underline-offset-4`}
							href={selfHostingGuideUrl}
						>
							{copy.guide}
						</a>
					</section>
				</div>

				<div className="mt-12 divide-y divide-olive-950/10 border-y border-olive-950/10 sm:mt-16 dark:divide-white/10 dark:border-white/10">
					<section className="grid gap-4 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
						<h2 className="text-xl/7 font-medium">{copy.operations}</h2>
						<p className="max-w-prose text-base/7 text-olive-700 dark:text-olive-300">
							{copy.operationsDescription}
						</p>
					</section>
					<section className="grid gap-4 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
						<h2 className="text-xl/7 font-medium">{copy.license}</h2>
						<div className="min-w-0">
							<p className="max-w-prose text-base/7 text-olive-700 dark:text-olive-300">
								{copy.licenseDescription}
							</p>
							<a
								className={`${linkClass} mt-3 inline-flex items-center underline underline-offset-4`}
								href={`${repositoryUrl}#license`}
							>
								{copy.licenseLink}
							</a>
						</div>
					</section>
				</div>
				<section className="mt-10 flex flex-col items-start justify-between gap-6 sm:mt-12 lg:flex-row lg:items-center lg:gap-12">
					<div className="max-w-2xl">
						<h2 className="font-display text-3xl/9">{copy.cloud}</h2>
						<p className="mt-3 text-base/7 text-olive-700 dark:text-olive-300">
							{copy.cloudDescription}
						</p>
					</div>
					<SoftButtonLink
						className={`${linkClass} max-w-full whitespace-normal text-center lg:shrink-0`}
						href={localePath(locale, "/pricing")}
						size="lg"
					>
						{copy.pricing}
					</SoftButtonLink>
				</section>
			</div>
		</Container>
	);
}
