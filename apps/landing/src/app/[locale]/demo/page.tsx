import type { Metadata } from "next";
import { Container } from "@/components/elements/container";
import { DemoForm } from "@/components/elements/demo-form";
import { HeroSimpleCentered } from "@/components/sections/hero-simple-centered";
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
		title: dict.demoPage.title,
		description: dict.demoPage.description,
		alternates: localizedAlternates(locale, "/demo"),
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

	return (
		<>
			<HeroSimpleCentered
				headline={dict.demoPage.headline}
				subheadline={<p>{dict.demoPage.subheadline}</p>}
			/>
			<section className="pb-24">
				<Container>
					<DemoForm copy={dict.demoPage.form} />
				</Container>
			</section>
		</>
	);
}
