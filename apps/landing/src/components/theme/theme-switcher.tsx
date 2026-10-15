"use client";

import { type ComponentType, useEffect, useId, useRef, useState } from "react";
import { MonitorIcon } from "@/components/icons/monitor-icon";
import { MoonIcon } from "@/components/icons/moon-icon";
import { SunIcon } from "@/components/icons/sun-icon";
import { type Theme, useTheme } from "./theme-provider";

type Labels = {
	toggle: string;
	light: string;
	dark: string;
	system: string;
};

const defaultLabels: Labels = {
	toggle: "Switch theme",
	light: "Light",
	dark: "Dark",
	system: "System",
};

export function ThemeSwitcher({ labels = defaultLabels }: { labels?: Labels }) {
	const { theme, resolved, setTheme } = useTheme();
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

	const TriggerIcon = resolved === "dark" ? MoonIcon : SunIcon;

	const options: {
		value: Theme;
		label: string;
		Icon: ComponentType<{ className?: string }>;
	}[] = [
		{ value: "light", label: labels.light, Icon: SunIcon },
		{ value: "dark", label: labels.dark, Icon: MoonIcon },
		{ value: "system", label: labels.system, Icon: MonitorIcon },
	];

	return (
		<div className="relative" ref={ref}>
			<button
				aria-controls={open ? panelId : undefined}
				aria-expanded={open}
				ref={triggerRef}
				aria-label={labels.toggle}
				className="inline-flex items-center rounded-full p-1.5 text-olive-950 hover:bg-olive-950/10 dark:text-white dark:hover:bg-white/10"
				onClick={() => setOpen(!open)}
				type="button"
			>
				<TriggerIcon className="size-5" />
			</button>
			{open && (
				<div
					id={panelId}
					className="absolute right-0 z-20 mt-1 min-w-36 rounded-lg border border-olive-950/10 bg-olive-100 py-1 shadow-lg dark:border-white/10 dark:bg-olive-950"
				>
					{options.map(({ value, label, Icon }) => {
						const active = value === theme;
						return (
							<button
								aria-pressed={active}
								className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm ${
									active
										? "font-medium text-olive-950 dark:text-white"
										: "text-olive-700 hover:text-olive-950 dark:text-olive-400 dark:hover:text-white"
								}`}
								key={value}
								onClick={() => {
									setTheme(value);
									triggerRef.current?.focus();
									setOpen(false);
								}}
								type="button"
							>
								<Icon className="size-4" />
								{label}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
