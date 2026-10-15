"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useSyncExternalStore,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "lunaris-theme";
const THEME_CHANGE_EVENT = "lunaris-theme-change";
let fallbackTheme: Theme = "system";

type ThemeContextValue = {
	theme: Theme;
	resolved: ResolvedTheme;
	setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme, systemDark: boolean): ResolvedTheme {
	const resolved: ResolvedTheme =
		theme === "system" ? (systemDark ? "dark" : "light") : theme;
	const root = document.documentElement;
	root.classList.toggle("dark", resolved === "dark");
	root.dataset.theme = theme;
	return resolved;
}

function readStoredTheme(): Theme {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		if (v === "light" || v === "dark" || v === "system") return v;
	} catch {}
	return fallbackTheme;
}

function subscribeToTheme(onChange: () => void) {
	window.addEventListener(THEME_CHANGE_EVENT, onChange);
	window.addEventListener("storage", onChange);

	return () => {
		window.removeEventListener(THEME_CHANGE_EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

function subscribeToSystemTheme(onChange: () => void) {
	const media = window.matchMedia("(prefers-color-scheme: dark)");
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

function readSystemTheme() {
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readServerTheme(): Theme {
	return "system";
}

function readServerSystemTheme() {
	return false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const theme = useSyncExternalStore(
		subscribeToTheme,
		readStoredTheme,
		readServerTheme,
	);
	const systemDark = useSyncExternalStore(
		subscribeToSystemTheme,
		readSystemTheme,
		readServerSystemTheme,
	);
	const resolved: ResolvedTheme =
		theme === "system" ? (systemDark ? "dark" : "light") : theme;

	useEffect(() => {
		applyTheme(theme, systemDark);
	}, [systemDark, theme]);

	const setTheme = useCallback((nextTheme: Theme) => {
		fallbackTheme = nextTheme;
		try {
			localStorage.setItem(STORAGE_KEY, nextTheme);
		} catch {}
		window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, resolved, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
	return ctx;
}
