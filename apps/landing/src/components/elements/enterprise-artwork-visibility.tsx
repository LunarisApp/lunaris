"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function EnterpriseArtworkVisibility({
	children,
}: {
	children: ReactNode;
}) {
	const frame = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const element = frame.current;
		if (
			!element ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				element.dataset.visible = "true";
				observer.disconnect();
			},
			{ threshold: 0.4 },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={frame} data-enterprise-artwork>
			{children}
		</div>
	);
}
