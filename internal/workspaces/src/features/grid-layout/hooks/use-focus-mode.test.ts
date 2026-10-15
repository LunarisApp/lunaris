/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";

const wrapper = ({ children }: { children: ReactNode }) =>
	createElement(HotkeyOverridesProvider, null, children);

const capturedHotkeys: Array<{
	handler: () => void;
	key: string;
	options?: Record<string, unknown>;
}> = [];

const store = {
	dockviewApi: null,
	exitFocusMode: vi.fn(),
	isFocusMode: false,
	toggleFocusMode: vi.fn(),
};

vi.mock("@tanstack/react-hotkeys", () => ({
	useHotkey: (key: string, handler: () => void, options?: Record<string, unknown>) => {
		capturedHotkeys.push({ key, handler, options });
	},
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("../context", () => ({
	useGridLayoutStore: (selector: (value: typeof store) => unknown) => selector(store),
}));

describe("useFocusMode", () => {
	beforeEach(() => {
		capturedHotkeys.length = 0;
		store.dockviewApi = null;
		store.exitFocusMode.mockReset();
		store.isFocusMode = false;
		store.toggleFocusMode.mockReset();
		document.documentElement.removeAttribute("data-focus-mode");
	});

	it("only enables Escape while focus mode is active", async () => {
		const { useFocusMode } = await import("./use-focus-mode");
		renderHook(() => useFocusMode(), { wrapper });

		expect(capturedHotkeys).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "Escape",
					options: expect.objectContaining({
						enabled: false,
						preventDefault: false,
						stopPropagation: false,
					}),
				}),
			]),
		);
	});

	it("enables Escape once focus mode is active", async () => {
		store.isFocusMode = true;

		const { useFocusMode } = await import("./use-focus-mode");
		renderHook(() => useFocusMode(), { wrapper });

		expect(capturedHotkeys).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "Escape",
					options: expect.objectContaining({
						enabled: true,
						preventDefault: false,
						stopPropagation: false,
					}),
				}),
			]),
		);
	});
});
