import type { Metadata } from "next";
import Image from "next/image";
import { PlatformIcon } from "@/components/downloads/platform-icon";
import { Container } from "@/components/elements/container";
import { downloadsCopy } from "@/data/downloads";
import { homepageCopy } from "@/data/homepage";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import { localizedAlternates } from "@/i18n/metadata";

const installers = [
	{ target: "macos", name: "macOS", format: ".dmg", description: "mac" },
	{
		target: "windows",
		name: "Windows",
		format: ".exe",
		description: "windows",
	},
	{ target: "linux", name: "Linux", format: ".deb", description: "linux" },
] as const;

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	return {
		title: `${homepageCopy[locale].download} Lunaris`,
		description: downloadsCopy[locale].subtitle,
		alternates: localizedAlternates(locale, "/downloads"),
	};
}

export default async function DownloadsPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale: rawLocale } = await params;
	const locale = rawLocale as Locale;
	const home = homepageCopy[locale];
	const copy = downloadsCopy[locale];
	return (
		<Container className="py-14 sm:py-20">
			<div className="mx-auto max-w-2xl">
				<header className="mb-12 flex flex-col items-center text-center sm:mb-16">
					<Image
						src="/img/lunaris-mark-light.svg"
						alt=""
						width={48}
						height={48}
						className="mb-6 size-12 dark:hidden"
					/>
					<Image
						src="/img/lunaris-mark-dark.svg"
						alt=""
						width={48}
						height={48}
						className="mb-6 hidden size-12 dark:block"
					/>
					<h1 className="font-display text-5xl/none tracking-tight text-balance text-olive-950 sm:text-6xl/none dark:text-olive-100">{`${home.download} Lunaris`}</h1>
					<p className="mt-5 text-base/7 text-pretty text-olive-600 dark:text-olive-400">
						{copy.subtitle}
					</p>
				</header>
				<div className="divide-y divide-olive-950/15 border-y border-olive-950/15 dark:divide-white/15 dark:border-white/15">
					{installers.map(({ target, name, format, description }) => (
						<section
							key={target}
							aria-labelledby={`${target}-heading`}
							className="grid gap-5 py-7 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 sm:py-8"
						>
							<div className="flex items-start gap-5">
								<PlatformIcon
									platform={target}
									className="mt-0.5 size-7 text-olive-950 dark:text-olive-100"
								/>
								<div>
									<h2
										id={`${target}-heading`}
										className="text-lg/7 font-medium text-olive-950 dark:text-olive-100"
									>
										{name}
									</h2>
									<p className="mt-1 text-sm/6 text-olive-600 dark:text-olive-400">
										{copy[description]}
									</p>
								</div>
							</div>
							<a
								href={localePath(locale, `/download/${target}`)}
								aria-label={`${home.downloadFor} ${name} (${format})`}
								className="group inline-flex min-h-12 items-center justify-between gap-5 rounded-lg bg-olive-950 px-5 py-3 text-sm/6 font-medium text-white transition-colors hover:bg-olive-800 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none sm:w-56 dark:bg-olive-300 dark:text-olive-950 dark:hover:bg-olive-100"
							>
								<span>
									{home.download}{" "}
									<span className="ml-1 font-normal opacity-70">{format}</span>
								</span>
								<svg
									aria-hidden="true"
									className="size-4"
									fill="none"
									stroke="currentColor"
									strokeWidth={1.5}
									strokeLinecap="round"
									strokeLinejoin="round"
									viewBox="0 0 24 24"
								>
									<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
								</svg>
							</a>
						</section>
					))}
				</div>
				<p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm/6 text-olive-600 dark:text-olive-400">
					{copy.browser}
					<a
						href="https://web.lunaris.app"
						className="inline-flex min-h-11 items-center gap-1.5 font-medium text-olive-950 underline underline-offset-4 hover:text-olive-600 dark:text-olive-100 dark:hover:text-white"
					>
						{home.open}
						<svg
							aria-hidden="true"
							className="size-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.5}
							strokeLinecap="round"
							strokeLinejoin="round"
							viewBox="0 0 16 16"
						>
							<path d="M4 12 12 4M4 4h8v8" />
						</svg>
					</a>
				</p>
			</div>
		</Container>
	);
}
