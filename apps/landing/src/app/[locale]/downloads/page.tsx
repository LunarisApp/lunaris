import type { Metadata } from "next";
import { Container } from "@/components/elements/container";
import { homepageCopy } from "@/data/homepage";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import { desktopPlatforms } from "@/lib/desktop-platform";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	return { title: `${homepageCopy[locale as Locale].allPlatforms} — Lunaris` };
}

export default async function DownloadsPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const copy = homepageCopy[locale];
	return (
		<Container className="py-16 sm:py-24">
			<h1 className="font-display text-4xl/11 tracking-tight text-olive-950 sm:text-5xl/13 dark:text-olive-100">{`${copy.download} Lunaris`}</h1>
			<h2 className="mt-6 text-lg/8 font-medium text-olive-700 dark:text-olive-300">
				{copy.allPlatforms}
			</h2>
			<ul className="mt-4 flex flex-col items-start gap-3 text-base/7 text-olive-700 dark:text-olive-300">
				{desktopPlatforms.map(({ target, label }) => (
					<li key={target}>
						<a
							className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-olive-950 focus-visible:outline-2 focus-visible:outline-offset-4 dark:hover:text-white"
							href={localePath(locale, `/download/${target}`)}
						>{`${copy.download} ${label}`}</a>
					</li>
				))}
			</ul>
		</Container>
	);
}
