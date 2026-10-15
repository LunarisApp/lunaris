import "./globals.css";

import type { Metadata } from "next";

import { LocalizedNotFound } from "@/components/sections/localized-not-found";
import { ThemeScript } from "@/components/theme/theme-script";
import { brandIcons } from "@/i18n/metadata";

export const metadata: Metadata = {
	title: "Page not found — Lunaris",
	description: "The requested page could not be found.",
	icons: brandIcons,
};

export default function GlobalNotFound() {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<ThemeScript />
				<link href="https://fonts.googleapis.com" rel="preconnect" />
				<link
					crossOrigin=""
					href="https://fonts.gstatic.com"
					rel="preconnect"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap"
					rel="stylesheet"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body className="min-h-screen bg-olive-100 font-sans text-olive-950 dark:bg-olive-950 dark:text-white">
				<LocalizedNotFound standalone />
			</body>
		</html>
	);
}
