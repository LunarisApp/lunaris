import type { Metadata } from "next";
import { Container } from "@/components/elements/container";
import { Heading } from "@/components/elements/heading";
import { McpSetup } from "@/components/sections/mcp-setup";
import { regionDirectory } from "@/data/regions";
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
		title: dict.mcpPage.title,
		description: dict.mcpPage.description,
		alternates: localizedAlternates(locale, "/mcp"),
	};
}

export default async function McpPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const dict = await getDictionary(locale);

	return (
		<section className="pt-14 pb-16 sm:pt-20 sm:pb-24">
			<Container>
				<div className="mx-auto max-w-4xl text-center">
					<Heading className="text-balance">{dict.mcpPage.headline}</Heading>
				</div>

				<div className="mt-10 sm:mt-14">
					<McpSetup
						copy={dict.mcpPage.setup}
						regions={regionDirectory.regions}
					/>
				</div>
			</Container>
		</section>
	);
}
