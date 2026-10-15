"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { type Locale, locales } from "@/i18n/config";
import { switchLocalePath } from "@/i18n/locale-path";

const localeNames: Record<Locale, string> = {
	en: "English",
	es: "Español",
	fr: "Français",
	de: "Deutsch",
	"pt-BR": "Português (BR)",
};

export function LanguageSwitcher({
	currentLocale,
	label,
}: {
	currentLocale: Locale;
	label: string;
}) {
	const currentPath = usePathname();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelId = useId();

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape" && open) {
				setOpen(false);
				if (ref.current?.contains(document.activeElement))
					triggerRef.current?.focus();
			}
		}
		function handleFocusOutside(event: FocusEvent) {
			if (ref.current && !ref.current.contains(event.target as Node))
				setOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		document.addEventListener("focusin", handleFocusOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
			document.removeEventListener("focusin", handleFocusOutside);
		};
	}, [open]);

	return (
		<div className="relative" ref={ref}>
			<button
				aria-controls={open ? panelId : undefined}
				aria-expanded={open}
				ref={triggerRef}
				aria-label={label}
				className="inline-flex items-center rounded-full p-1.5 text-olive-950 hover:bg-olive-950/10 dark:text-white dark:hover:bg-white/10"
				onClick={() => setOpen(!open)}
				type="button"
			>
				<svg
					aria-hidden="true"
					className="size-5"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<path
						d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.466.732-3.558"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{open && (
				<div
					id={panelId}
					className="absolute right-0 z-20 mt-1 min-w-32 rounded-lg border border-olive-950/10 bg-olive-100 py-1 shadow-lg dark:border-white/10 dark:bg-olive-950"
				>
					{locales.map((locale) => (
						<a
							aria-current={locale === currentLocale ? "true" : undefined}
							lang={locale}
							hrefLang={locale}
							className={`block px-4 py-1.5 text-sm ${
								locale === currentLocale
									? "font-medium text-olive-950 dark:text-white"
									: "text-olive-700 hover:text-olive-950 dark:text-olive-400 dark:hover:text-white"
							}`}
							href={switchLocalePath(currentLocale, locale, currentPath)}
							key={locale}
							onClick={() => setOpen(false)}
						>
							{localeNames[locale]}
						</a>
					))}
				</div>
			)}
		</div>
	);
}
