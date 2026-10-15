"use client";

import { createElement, useEffect, useRef } from "react";

export function ProboCookieSettingsLink({ label }: { label: string }) {
	const linkRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const link = linkRef.current;
		if (!link) {
			return;
		}

		const restoreLabel = () => {
			if (!link.textContent?.trim()) {
				link.textContent = label;
			}
		};

		restoreLabel();
		const observer = new MutationObserver(restoreLabel);
		observer.observe(link, {
			characterData: true,
			childList: true,
			subtree: true,
		});

		return () => observer.disconnect();
	}, [label]);

	return createElement(
		"probo-settings-link",
		{
			className: "cursor-pointer",
			ref: linkRef,
		},
		label,
	);
}
