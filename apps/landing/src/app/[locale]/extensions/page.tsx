import type { Metadata } from "next";
import { Container } from "@/components/elements/container";
import { ExtensionCatalog } from "@/components/sections/extension-catalog";
import { catalogUpdatedAt, extensionCatalog } from "@/data/extension-catalog";
import {
	extensionDocsUrl,
	extensionQuickstartUrl,
	extensionsCopy,
} from "@/data/extensions";
import type { Locale } from "@/i18n/config";
import { localizedAlternates } from "@/i18n/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = extensionsCopy[locale];
	return {
		title: copy.metaTitle,
		description: copy.metaDescription,
		alternates: localizedAlternates(locale, "/extensions"),
	};
}

export default async function ExtensionsPage({ params }: Props) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = extensionsCopy[locale];
	const textLink =
		"inline-flex min-h-11 items-center text-sm/6 font-medium text-olive-700 underline-offset-4 hover:underline dark:text-olive-300";
	return (
		<Container className="pt-10 pb-14 sm:pt-14 sm:pb-20">
			<header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
				<div>
					<h1 className="font-display text-5xl/13 tracking-tight text-olive-950 dark:text-olive-100">
						{copy.nav}
					</h1>
					<p className="mt-3 max-w-xl text-base/7 text-pretty text-olive-700 dark:text-olive-300">
						{copy.description}
					</p>
				</div>
				<a className={textLink} href={extensionDocsUrl}>
					{copy.manage}
				</a>
			</header>
			<ExtensionCatalog
				extensions={extensionCatalog}
				copy={copy}
				locale={locale}
			/>
			<div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-olive-950/15 pt-5 dark:border-white/20">
				<p className="text-xs/5 text-olive-600 dark:text-olive-400">
					{copy.updated}:{" "}
					{new Intl.DateTimeFormat(locale, {
						dateStyle: "medium",
						timeZone: "UTC",
					}).format(new Date(catalogUpdatedAt))}
				</p>
				<a className={textLink} href={extensionQuickstartUrl}>
					{copy.build}
				</a>
			</div>
		</Container>
	);
}
