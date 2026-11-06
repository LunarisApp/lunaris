"use client";

import { type ReactNode, useEffect, useState } from "react";
import { PlatformIcon } from "@/components/downloads/platform-icon";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import {
	type DesktopPlatform,
	desktopPlatforms,
	detectDesktopPlatform,
} from "@/lib/desktop-platform";

export function DesktopDownload({
	children,
	locale,
	downloadLabel,
	fallbackLabel,
	allPlatformsLabel,
}: {
	children: ReactNode;
	locale: Locale;
	downloadLabel: string;
	fallbackLabel: string;
	allPlatformsLabel: string;
}) {
	const [platform, setPlatform] = useState<DesktopPlatform | null>(null);
	useEffect(() => {
		setPlatform(detectDesktopPlatform(navigator));
	}, []);
	const detected = desktopPlatforms.find(({ target }) => target === platform);
	return (
		<div className="mx-auto mt-8 max-w-lg">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>a]:w-full">
				{children}
				<a
					className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full border border-olive-950/25 bg-transparent px-5 py-2 text-sm/7 font-medium text-olive-950 transition-colors hover:border-olive-950/50 hover:bg-olive-950/5 focus-visible:outline-2 focus-visible:outline-offset-4 active:bg-olive-950/10 motion-reduce:transition-none dark:border-olive-300/35 dark:text-olive-100 dark:hover:border-olive-300/65 dark:hover:bg-white/5 dark:active:bg-white/10"
					href={localePath(
						locale,
						detected ? `/download/${detected.target}` : "/downloads",
					)}
				>
					{platform && <PlatformIcon platform={platform} />}
					{detected ? `${downloadLabel} ${detected.label}` : fallbackLabel}
				</a>
			</div>
			<a
				className="group mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs/5 text-olive-600 underline-offset-4 hover:text-olive-950 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 dark:text-olive-400 dark:hover:text-olive-100"
				href={localePath(locale, "/downloads")}
			>
				{allPlatformsLabel}
				<svg
					aria-hidden="true"
					className="size-3"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					strokeLinecap="round"
					strokeLinejoin="round"
					viewBox="0 0 16 16"
				>
					<path d="M3 8h10m-4-4 4 4-4 4" />
				</svg>
			</a>
		</div>
	);
}
