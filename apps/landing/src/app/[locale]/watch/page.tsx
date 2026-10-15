import type { Metadata } from "next";
import { Container } from "@/components/elements/container";
import { DemoVideo } from "@/components/elements/demo-video";
import { Heading } from "@/components/elements/heading";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedAlternates } from "@/i18n/metadata";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const dict = await getDictionary(locale as Locale);

	return {
		title: dict.accessibility.demoVideo,
		description: dict.accessibility.demoVideoDescription,
		alternates: localizedAlternates(locale as Locale, "/watch"),
	};
}

export default async function Page({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const dict = await getDictionary(locale as Locale);

	return (
		<section aria-labelledby="video-heading" className="py-10 sm:py-16">
			<Container className="flex flex-col gap-8">
				<Heading id="video-heading" className="text-center">
					{dict.accessibility.demoVideo}
				</Heading>
				<div className="overflow-hidden rounded-xl bg-olive-950 ring-1 ring-olive-950/10 dark:ring-white/10">
					<DemoVideo
						autoPlay={false}
						label={dict.accessibility.demoVideo}
						description={dict.accessibility.demoVideoDescription}
					/>
				</div>
			</Container>
		</section>
	);
}
