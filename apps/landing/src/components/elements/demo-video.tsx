"use client";

import { useEffect, useId, useRef, useState } from "react";

// Chapter boundaries match the bundled 25-second workspace walkthrough.
const chapterStarts = [0, 6, 12] as const;

export function DemoVideo({
	label,
	description,
	autoPlay = true,
	chapters,
	chapterNavigationLabel,
}: {
	label: string;
	description: string;
	autoPlay?: boolean;
	chapters?: readonly [string, string, string];
	chapterNavigationLabel?: string;
}) {
	const descriptionId = useId();
	const videoId = useId();
	const ref = useRef<HTMLVideoElement>(null);
	const [activeChapter, setActiveChapter] = useState(0);

	useEffect(() => {
		const video = ref.current;
		if (!video || !autoPlay) return;
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (!preference.matches) void video.play().catch(() => {});
		const pauseForReducedMotion = () => {
			if (preference.matches) video.pause();
		};
		preference.addEventListener("change", pauseForReducedMotion);
		return () =>
			preference.removeEventListener("change", pauseForReducedMotion);
	}, [autoPlay]);

	return (
		<figure
			className={
				chapters
					? "overflow-hidden rounded-xl bg-olive-300/60 p-1.5 dark:bg-olive-800"
					: undefined
			}
		>
			<video
				aria-describedby={descriptionId}
				aria-label={label}
				className="block aspect-video w-full rounded-lg object-contain"
				controls
				height={720}
				id={videoId}
				loop={autoPlay}
				muted
				onTimeUpdate={
					chapters
						? (event) => {
								const time = event.currentTarget.currentTime;
								setActiveChapter(
									time >= chapterStarts[2]
										? 2
										: time >= chapterStarts[1]
											? 1
											: 0,
								);
							}
						: undefined
				}
				playsInline
				poster="/video/demo-poster.jpg"
				preload="metadata"
				ref={ref}
				width={1280}
			>
				<source src="/video/demo.mp4" type="video/mp4" />
			</video>
			{chapters && (
				<div
					aria-label={chapterNavigationLabel}
					className="grid grid-cols-3 gap-1 pt-1.5"
					role="group"
				>
					{chapters.map((chapter, index) => (
						<button
							aria-controls={videoId}
							aria-pressed={activeChapter === index}
							className="flex min-h-11 items-center justify-center gap-2 rounded-md px-2 py-2 text-center text-xs/5 font-medium text-olive-700 transition-colors hover:bg-white/40 aria-pressed:bg-olive-100 aria-pressed:text-olive-950 sm:text-sm/6 dark:text-olive-300 dark:hover:bg-white/10 dark:aria-pressed:bg-olive-700 dark:aria-pressed:text-olive-100"
							key={chapter}
							onClick={() => {
								const video = ref.current;
								if (!video) return;
								video.currentTime = chapterStarts[index] ?? 0;
								setActiveChapter(index);
								void video.play().catch(() => {});
							}}
							type="button"
						>
							<svg
								aria-hidden="true"
								className="size-3 shrink-0"
								fill="none"
								stroke="currentColor"
								strokeLinejoin="round"
								strokeWidth={1.5}
								viewBox="0 0 12 12"
							>
								<path d="m4 2 6 4-6 4V2Z" />
							</svg>
							{chapter}
						</button>
					))}
				</div>
			)}
			<figcaption className="sr-only" id={descriptionId}>
				{description}
			</figcaption>
		</figure>
	);
}
