"use client";

import { useEffect, useId, useRef } from "react";

export function DemoVideo({
	label,
	description,
	autoPlay = true,
}: {
	label: string;
	description: string;
	autoPlay?: boolean;
}) {
	const descriptionId = useId();
	const ref = useRef<HTMLVideoElement>(null);

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
		<figure>
			<video
				aria-describedby={descriptionId}
				aria-label={label}
				className="block aspect-video w-full object-contain"
				controls
				height={720}
				loop={autoPlay}
				muted
				playsInline
				poster="/video/demo-poster.jpg"
				preload="metadata"
				ref={ref}
				width={1280}
			>
				<source src="/video/demo.mp4" type="video/mp4" />
			</video>
			<figcaption className="sr-only" id={descriptionId}>
				{description}
			</figcaption>
		</figure>
	);
}
