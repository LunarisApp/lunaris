import type { Metadata } from "next";
import { Container } from "@/components/elements/container";
import { WordCounterTool } from "@/components/tools/word-counter-tool";
import { getWordCounterCopy } from "@/data/word-counter-copy";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import { localizedAlternates, siteUrl } from "@/i18n/metadata";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = getWordCounterCopy(locale);

	return {
		title: copy.meta.title,
		description: copy.meta.description,
		alternates: localizedAlternates(locale, "/tools/word-counter"),
		openGraph: {
			title: copy.meta.title,
			description: copy.meta.description,
			type: "website",
		},
	};
}

export default async function WordCounterPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = getWordCounterCopy(locale);
	const structuredData = {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: copy.heading,
		description: copy.meta.description,
		url: `${siteUrl}${localePath(locale, "/tools/word-counter")}`,
		applicationCategory: "UtilitiesApplication",
		browserRequirements: "Requires JavaScript",
		isAccessibleForFree: true,
		operatingSystem: "Any",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
	};

	return (
		<>
			<script
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
				}}
				type="application/ld+json"
			/>

			<section className="px-2 pt-4 pb-8 sm:pt-6 sm:pb-12">
				<Container className="px-2 sm:px-6 lg:px-10">
					<WordCounterTool copy={copy} locale={locale} />
				</Container>
			</section>
		</>
	);
}
