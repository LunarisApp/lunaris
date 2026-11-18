"use client";

import { useEffect, useId, useRef, useState } from "react";

// Start times in the bundled workspace walkthrough, in seconds.
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

	const video = (
		<video
			aria-describedby={descriptionId}
			aria-label={label}
			className="block aspect-video w-full rounded-lg bg-black object-contain"
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
								chapterStarts.findLastIndex((start) => time >= start),
							);
						}
					: undefined
			}
			playsInline
			poster={
				chapters ? "/img/workspace-preview.webp" : "/video/demo-poster.jpg"
			}
			preload="metadata"
			ref={ref}
			width={1280}
		>
			<source src="/video/demo.mp4" type="video/mp4" />
		</video>
	);

	return (
		<figure>
			{chapters ? (
				<>
					{video}
					<div
						aria-label={chapterNavigationLabel}
						role="group"
						className="mt-3 grid grid-cols-3 items-stretch gap-1 border-b border-olive-950/15 pb-3 sm:flex sm:flex-wrap sm:gap-x-4 dark:border-white/15"
					>
						{chapters.map((chapter, index) => {
							const start = chapterStarts[index];
							return (
								<button
									aria-controls={videoId}
									aria-pressed={activeChapter === index}
									className="inline-flex min-h-10 cursor-pointer flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left text-xs/5 font-medium text-olive-700 hover:bg-olive-200 aria-pressed:bg-olive-950/7 aria-pressed:text-olive-950 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:px-3.5 sm:text-sm dark:text-olive-300 dark:hover:bg-white/10 dark:aria-pressed:bg-white/10 dark:aria-pressed:text-white"
									key={chapter}
									type="button"
									onClick={() => {
										const element = ref.current;
										if (!element || start === undefined) return;
										element.currentTime = start;
										setActiveChapter(index);
										void element.play().catch(() => {});
									}}
								>
									<span className="text-xs text-olive-600 tabular-nums dark:text-olive-400">
										0:{String(start).padStart(2, "0")}
									</span>
									{chapter}
								</button>
							);
						})}
					</div>
				</>
			) : (
				video
			)}
			<figcaption className="sr-only" id={descriptionId}>
				{description}
			</figcaption>
		</figure>
	);
}
