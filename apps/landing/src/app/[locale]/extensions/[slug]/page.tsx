import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackedButtonLink } from "@/components/analytics/tracked-button-link";
import { Container } from "@/components/elements/container";
import { ExtensionIcon } from "@/components/elements/extension-icon";
import { ArrowNarrowRightIcon } from "@/components/icons/arrow-narrow-right-icon";
import { extensionCatalog } from "@/data/extension-catalog";
import { extensionDocsUrl, extensionsCopy } from "@/data/extensions";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import { localizedAlternates } from "@/i18n/metadata";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
	return extensionCatalog.map(({ slug }) => ({ slug }));
}

function getExtension(slug: string) {
	const extension = extensionCatalog.find((entry) => entry.slug === slug);
	if (!extension) notFound();
	return extension;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale: rawLocale, slug } = await params;
	const locale = rawLocale as Locale;
	const extension = getExtension(slug);
	const copy = extensionsCopy[locale];
	return {
		title: `${extension.name} — ${copy.nav} — Lunaris`,
		description: copy.items[slug]?.description ?? extension.description,
		alternates: localizedAlternates(locale, `/extensions/${slug}`),
	};
}

export default async function ExtensionDetailsPage({ params }: Props) {
	const { locale: rawLocale, slug } = await params;
	const locale = rawLocale as Locale;
	const extension = getExtension(slug);
	const copy = extensionsCopy[locale];
	const description = copy.items[slug];
	const textLink =
		"inline-flex min-h-11 items-center gap-2 text-sm/6 font-medium text-olive-700 underline-offset-4 hover:underline dark:text-olive-300";
	return (
		<Container className="pt-6 pb-14 sm:pt-8 sm:pb-20">
			<Link className={textLink} href={localePath(locale, "/extensions")}>
				<ArrowNarrowRightIcon className="rotate-180" />
				{copy.allExtensions}
			</Link>
			<header className="mt-6 flex items-start gap-4 sm:gap-5">
				<ExtensionIcon
					className="size-16 rounded-2xl sm:size-20"
					id={slug}
					src={extension.iconUrl}
				/>
				<div className="min-w-0">
					<h1 className="text-2xl/8 font-semibold tracking-tight text-olive-950 sm:text-3xl/9 dark:text-olive-100">
						{extension.name}
					</h1>
					<p className="mt-2 max-w-2xl text-base/7 text-pretty text-olive-700 dark:text-olive-300">
						{description?.description ?? extension.description}
					</p>
				</div>
			</header>
			<div className="mt-8 grid items-start gap-8 border-t border-olive-950/15 pt-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 dark:border-white/20">
				<div className="min-w-0 space-y-8">
					{extension.screenshots.length > 0 && (
						<section aria-labelledby="screenshots-heading">
							<h2
								className="mb-4 text-base/7 font-semibold text-olive-950 dark:text-olive-100"
								id="screenshots-heading"
							>
								{copy.screenshotsLabel}
							</h2>
							<div className="space-y-4">
								{extension.screenshots.map((screenshot) => (
									<a
										aria-label={`${copy.screenshotFull}: ${extension.name}`}
										className="block cursor-zoom-in overflow-hidden rounded-xl bg-olive-200 dark:bg-olive-800"
										href={screenshot.src}
										key={screenshot.src}
										rel="noreferrer"
										target="_blank"
									>
										<Image
											alt={screenshot.alt}
											className="h-auto w-full"
											height={screenshot.height}
											sizes="(min-width: 1024px) 800px, 100vw"
											src={screenshot.src}
											width={screenshot.width}
										/>
									</a>
								))}
							</div>
						</section>
					)}
					<section aria-labelledby="about-heading">
						<h2
							className="text-base/7 font-semibold text-olive-950 dark:text-olive-100"
							id="about-heading"
						>
							{copy.about}
						</h2>
						<p className="mt-3 max-w-prose whitespace-pre-line text-base/7 text-pretty text-olive-700 dark:text-olive-300">
							{description?.about ??
								extension.longDescription ??
								extension.description}
						</p>
						<ul className="mt-5 flex flex-wrap gap-2">
							{extension.keywords.map((keyword) => (
								<li key={keyword}>
									<Link
										className="inline-flex min-h-9 items-center rounded-full bg-olive-200/60 px-3 text-xs/5 text-olive-700 hover:bg-olive-300/70 dark:bg-white/10 dark:text-olive-300 dark:hover:bg-white/15"
										href={`${localePath(locale, "/extensions")}?q=${encodeURIComponent(keyword)}`}
									>
										{keyword}
									</Link>
								</li>
							))}
						</ul>
					</section>
				</div>
				<aside className="space-y-7 lg:sticky lg:top-28">
					<section
						aria-labelledby="install-heading"
						className="rounded-xl bg-olive-200/50 p-5 dark:bg-white/5"
					>
						<h2
							className="text-base/7 font-semibold text-olive-950 dark:text-olive-100"
							id="install-heading"
						>
							{copy.installTitle}
						</h2>
						<p className="mt-2 text-sm/6 text-olive-700 dark:text-olive-300">
							{extension.builtIn ? copy.builtInNote : copy.catalogNote}
						</p>
						<TrackedButtonLink
							analyticsProperties={{
								cta: "open_web_app",
								destination: "web",
								location: "extension_details",
								extension: extension.id,
							}}
							className="mt-5 min-h-11 w-full gap-2"
							href="https://web.lunaris.app"
						>
							{copy.open}
							<ArrowNarrowRightIcon />
						</TrackedButtonLink>
						<a className={`${textLink} mt-2`} href={extensionDocsUrl}>
							{copy.manage}
						</a>
					</section>
					<section aria-labelledby="details-heading">
						<h2
							className="text-base/7 font-semibold text-olive-950 dark:text-olive-100"
							id="details-heading"
						>
							{copy.detailsLabel}
						</h2>
						<dl className="mt-3 space-y-3 text-sm/6">
							{[
								[copy.developer, extension.developer],
								[copy.version, extension.version],
								[copy.api, extension.api],
								[
									copy.typeLabel,
									extension.builtIn ? copy.builtIn : copy.catalog,
								],
							].map(([label, value]) => (
								<div className="flex justify-between gap-4" key={label}>
									<dt className="text-olive-600 dark:text-olive-400">
										{label}
									</dt>
									<dd className="text-right font-medium text-olive-950 dark:text-olive-100">
										{value}
									</dd>
								</div>
							))}
						</dl>
						<div className="mt-4 flex flex-wrap gap-x-5">
							<a className={textLink} href={extension.repository}>
								{copy.source}
							</a>
							{extension.website && (
								<a className={textLink} href={extension.website}>
									{copy.website}
								</a>
							)}
						</div>
					</section>
					<section
						aria-labelledby="permissions-heading"
						className="border-t border-olive-950/15 pt-5 dark:border-white/20"
					>
						<h2
							className="text-base/7 font-semibold text-olive-950 dark:text-olive-100"
							id="permissions-heading"
						>
							{copy.permissionsLabel}
						</h2>
						<ul className="mt-3 space-y-2 text-sm/6 text-olive-700 dark:text-olive-300">
							{extension.permissions.map((permission) => (
								<li key={permission}>{copy.permissions[permission]}</li>
							))}
						</ul>
					</section>
				</aside>
			</div>
		</Container>
	);
}
