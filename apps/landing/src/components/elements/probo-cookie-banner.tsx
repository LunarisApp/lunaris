"use client";

import { createElement, useEffect, useState } from "react";

const PRODUCTION_ORIGIN = "https://lunaris.app";
const PROBO_BANNER_ID = process.env.NEXT_PUBLIC_PROBO_COOKIE_BANNER_ID;
const PROBO_BASE_URL = process.env.NEXT_PUBLIC_PROBO_COOKIE_BANNER_BASE_URL;

export function ProboCookieBanner() {
	const [registered, setRegistered] = useState(false);

	useEffect(() => {
		if (
			!PROBO_BANNER_ID ||
			!PROBO_BASE_URL ||
			window.location.origin !== PRODUCTION_ORIGIN
		) {
			return;
		}

		let active = true;
		void import("@probo/cookie-banner").then(({ registerCookieBanner }) => {
			if (!active) {
				return;
			}

			registerCookieBanner();
			setRegistered(true);
		});

		return () => {
			active = false;
		};
	}, []);

	if (!registered || !PROBO_BANNER_ID || !PROBO_BASE_URL) {
		return null;
	}

	return createElement("probo-cookie-banner", {
		"banner-id": PROBO_BANNER_ID,
		"base-url": PROBO_BASE_URL,
		position: "bottom-left",
	});
}
