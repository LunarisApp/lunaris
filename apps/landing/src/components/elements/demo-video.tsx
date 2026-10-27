"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

// Chapter boundaries match the bundled 25-second workspace walkthrough.
const chapterStarts = [0, 6, 12] as const;

export function DemoVideo({
	label,
	description,
	autoPlay = true,
	chapters,
	chapterNavigationLabel,
	chapterDescriptions,
	upcomingChapter,
	children,
}: {
	label: string;
	description: string;
	autoPlay?: boolean;
	chapters?: readonly [string, string, string];
	chapterNavigationLabel?: string;
	chapterDescriptions?: readonly [string, string, string];
	upcomingChapter?: { title: string; description: string };
	children?: ReactNode;
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
					className={`grid gap-1 pt-1.5 ${upcomingChapter ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3"}`}
					role="group"
				>
					{chapters.map((chapter, index) => (
						<button
							aria-controls={videoId}
							aria-pressed={activeChapter === index}
							className="group flex min-h-12 flex-col items-start justify-start gap-1 rounded-lg px-3 py-3 text-left text-xs/5 font-medium text-olive-700 transition-colors hover:bg-white/40 aria-pressed:bg-olive-100 aria-pressed:text-olive-950 sm:px-5 sm:py-4 sm:text-sm/6 motion-reduce:transition-none dark:text-olive-300 dark:hover:bg-white/10 dark:aria-pressed:bg-olive-700 dark:aria-pressed:text-olive-100"
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
							<span className="flex items-center gap-2">
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
							</span>
							{chapterDescriptions && (
								<span className="hidden max-w-56 text-xs/5 font-normal text-olive-600 sm:block dark:text-olive-300">
									{chapterDescriptions[index]}
								</span>
							)}
						</button>
					))}
					{upcomingChapter && (
						<div className="flex min-h-12 flex-col items-start justify-start gap-1 px-3 py-3 text-left text-xs/5 text-olive-600 sm:px-5 sm:py-4 sm:text-sm/6 dark:text-olive-300">
							<span className="flex items-center gap-2 font-medium">
								<svg
									aria-hidden="true"
									className="size-3 shrink-0"
									fill="none"
									stroke="currentColor"
									strokeWidth={1.5}
									strokeLinecap="round"
									viewBox="0 0 12 12"
								>
									<path d="M6 2v8M2 6h8" />
								</svg>
								{upcomingChapter.title}
							</span>
							<span className="hidden max-w-56 text-xs/5 sm:block">
								{upcomingChapter.description}
							</span>
						</div>
					)}
				</div>
			)}
			{children}
			<figcaption className="sr-only" id={descriptionId}>
				{description}
			</figcaption>
		</figure>
	);
}
