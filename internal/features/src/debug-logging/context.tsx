"use client";

import { log } from "evlog";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";

const STORAGE_KEY = "lunaris.debugLogging";

// --- Module-level evlog gate ---
// When disabled, only warn/error pass through. Debug and info are suppressed.
const originalDebug = log.debug;
const originalInfo = log.info;

let _debugEnabled =
	typeof window !== "undefined"
		? window.localStorage?.getItem(STORAGE_KEY) === "true"
		: false;

log.debug = ((...args: Parameters<typeof originalDebug>) => {
	if (_debugEnabled) originalDebug(...args);
}) as typeof originalDebug;

log.info = ((...args: Parameters<typeof originalInfo>) => {
	if (_debugEnabled) originalInfo(...args);
}) as typeof originalInfo;

// --- React context ---
const DebugLoggingContext = createContext<{
	debugLogging: boolean;
	setDebugLogging: (enabled: boolean) => void;
} | null>(null);

export function DebugLoggingProvider({ children }: { children: ReactNode }) {
	const [debugLogging, setDebugLoggingState] = useState(() => _debugEnabled);

	const setDebugLogging = useCallback((enabled: boolean) => {
		setDebugLoggingState(enabled);
		localStorage.setItem(STORAGE_KEY, String(enabled));
		_debugEnabled = enabled;
	}, []);

	return (
		<DebugLoggingContext.Provider value={{ debugLogging, setDebugLogging }}>
			{children}
		</DebugLoggingContext.Provider>
	);
}

export function useDebugLogging() {
	const context = useContext(DebugLoggingContext);
	if (!context) {
		throw new Error(
			"useDebugLogging must be used within DebugLoggingProvider",
		);
	}
	return context;
}
