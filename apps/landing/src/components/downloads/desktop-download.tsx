"use client";

import { useEffect, useState } from "react";
import { PlatformIcon } from "@/components/downloads/platform-icon";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/locale-path";
import {
	type DesktopPlatform,
	desktopPlatforms,
	detectDesktopPlatform,
} from "@/lib/desktop-platform";

export function DesktopDownload({
	locale,
	downloadLabel,
	fallbackLabel,
	otherPlatformsLabel,
}: {
	locale: Locale;
	downloadLabel: string;
	fallbackLabel: string;
	otherPlatformsLabel: string;
}) {
	const [platform, setPlatform] = useState<DesktopPlatform | null>(null);
	useEffect(() => {
		setPlatform(detectDesktopPlatform(navigator));
	}, []);
	const detected = desktopPlatforms.find(({ target }) => target === platform);
	return (
		<div className="mt-4 flex flex-wrap items-center gap-2.5">
			<a
				className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-olive-950 px-4 py-2 text-sm/7 font-medium text-white transition-colors hover:bg-olive-800 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none sm:px-5 dark:bg-olive-300 dark:text-olive-950 dark:hover:bg-olive-200 dark:focus-visible:outline-white"
				href={localePath(
					locale,
					detected ? `/download/${detected.target}` : "/downloads",
				)}
			>
				{detected && <PlatformIcon platform={detected.target} />}
				{detected ? `${downloadLabel} ${detected.label}` : fallbackLabel}
			</a>
			{detected && (
				<a
					className="inline-flex min-h-11 items-center justify-center rounded-full bg-white/40 px-4 py-1.5 text-sm/7 font-medium text-olive-950 backdrop-blur-md transition-colors hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none sm:px-5 dark:bg-white/8 dark:text-white dark:hover:bg-white/15 dark:focus-visible:outline-white"
					href={localePath(locale, "/downloads")}
				>
					{otherPlatformsLabel}
				</a>
			)}
		</div>
	);
}
