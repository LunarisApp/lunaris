import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { getHotkeyBinding } from "./helpers";
import {
	createHotkeyOverridesStore,
	getHotkeyOverrides,
	HotkeyOverridesProvider,
	isValidHotkeyBinding,
	useHotkeyOverrides,
} from "./overrides";
import { HOTKEYS } from "./registry";

afterEach(() => {
	window.localStorage.clear();
});

describe("hotkey overrides store (factory)", () => {
	it("starts empty", () => {
		const store = createHotkeyOverridesStore();
		expect(store.getState().overrides).toEqual({});
	});

	it("sets and clears overrides", () => {
		const store = createHotkeyOverridesStore();
		store.getState().setOverride("toggle-search", "Mod+J");
		expect(store.getState().overrides["toggle-search"]).toBe("Mod+J");

		store.getState().clearOverride("toggle-search");
		expect(store.getState().overrides["toggle-search"]).toBeUndefined();
	});

	it("resetAll clears every override", () => {
		const store = createHotkeyOverridesStore();
		store.getState().setOverride("toggle-search", "Mod+J");
		store.getState().setOverride("open-settings", "Mod+.");
		store.getState().resetAll();
		expect(store.getState().overrides).toEqual({});
	});
});

describe("getHotkeyBinding with overrides", () => {
	it("returns override when explicit arg set for HotkeyId", () => {
		expect(getHotkeyBinding("toggle-search", "windows")).toBe("Mod+K");
		expect(
			getHotkeyBinding("toggle-search", "windows", { "toggle-search": "Mod+J" }),
		).toBe("Mod+J");
	});

	it("returns override for HotkeyDefinition", () => {
		expect(
			getHotkeyBinding(HOTKEYS["delete-resource"], "mac", {
				"delete-resource": "Mod+Shift+X",
			}),
		).toBe("Mod+Shift+X");
	});

	it("falls back to platform binding when overrides empty", () => {
		expect(getHotkeyBinding("delete-resource", "mac", {})).toBe("Mod+Backspace");
		expect(getHotkeyBinding("delete-resource", "windows", {})).toBe("Delete");
	});
});

function Wrapper({ children }: { children: ReactNode }) {
	return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

describe("useHotkeyOverrides + provider integration", () => {
	it("throws when used outside provider", () => {
		function Consumer() {
			return <>{useHotkeyOverrides((s) => JSON.stringify(s.overrides))}</>;
		}
		expect(() => render(<Consumer />)).toThrow(
			/HotkeyOverridesProvider/,
		);
	});

	it("wires the module-level singleton so pure getHotkeyBinding sees store overrides", () => {
		type Setter = (id: "toggle-search", key: string) => void;
		const captured: { setOverride: Setter | null } = { setOverride: null };

		function Probe() {
			captured.setOverride = useHotkeyOverrides((s) => s.setOverride) as Setter;
			return null;
		}

		render(
			<Wrapper>
				<Probe />
			</Wrapper>,
		);

		// Before override: pure fn reads default
		expect(getHotkeyBinding("toggle-search", "windows")).toBe("Mod+K");
		expect(getHotkeyOverrides()).toEqual({});

		act(() => {
			captured.setOverride?.("toggle-search", "Mod+J");
		});

		// After override: pure fn reads from mounted store via module ref
		expect(getHotkeyBinding("toggle-search", "windows")).toBe("Mod+J");
		expect(getHotkeyOverrides()).toEqual({ "toggle-search": "Mod+J" });
	});

	it("returns empty overrides when no provider mounted", () => {
		expect(getHotkeyOverrides()).toEqual({});
	});
});

describe("isValidHotkeyBinding", () => {
	it.each([
		["Mod+K", true],
		["Shift+Mod+K", true],
		["F2", true],
		["", false],
		["Mod", false],
		["Shift+Alt", false],
		["Mod+Ctrl", false],
	])("isValidHotkeyBinding(%j) === %j", (input, expected) => {
		expect(isValidHotkeyBinding(input)).toBe(expected);
	});

	it("rejects non-string values", () => {
		expect(isValidHotkeyBinding(null)).toBe(false);
		expect(isValidHotkeyBinding(undefined)).toBe(false);
		expect(isValidHotkeyBinding(42)).toBe(false);
		expect(isValidHotkeyBinding({})).toBe(false);
	});
});

describe("persist rehydration sanitization", () => {
	it("drops removed and unknown hotkey ids, preserving current bindings", () => {
		window.localStorage.setItem(
			"lunaris.hotkeyOverrides",
			JSON.stringify({
				state: {
					overrides: {
						"toggle-search": "Mod+J",
						"removed-hotkey-id": "Mod+X",
						"open-workspace-hierarchy": "Mod+E",
						"copy-items": "Mod+Shift+C",
						"paste-items": "Mod+Shift+V",
						"delete-item": "Mod+Shift+X",
						"rename-item": "Mod+R",
						"open-organization": "Mod+J",
						"open-workspace-settings": "Mod+J",
						"rename-resource": "F2",
					},
				},
				version: 1,
			}),
		);

		const store = createHotkeyOverridesStore();

		expect(store.getState().overrides).toEqual({
			"toggle-search": "Mod+J",
			"rename-resource": "F2",
		});
		expect(getHotkeyBinding("copy-resources", "windows", store.getState().overrides)).toBe(
			getHotkeyBinding("copy-resources", "windows", {}),
		);
	});

	it("drops invalid binding shapes on load", () => {
		window.localStorage.setItem(
			"lunaris.hotkeyOverrides",
			JSON.stringify({
				state: {
					overrides: {
						"toggle-search": "Mod+J",
						"open-settings": "",
						"open-debugger": "Shift",
						"close-tab": 42,
					},
				},
				version: 1,
			}),
		);

		const store = createHotkeyOverridesStore();

		expect(store.getState().overrides).toEqual({ "toggle-search": "Mod+J" });
	});

	it("returns empty state when persisted payload is malformed", () => {
		window.localStorage.setItem(
			"lunaris.hotkeyOverrides",
			JSON.stringify({ state: { overrides: "not-an-object" }, version: 1 }),
		);

		const store = createHotkeyOverridesStore();

		expect(store.getState().overrides).toEqual({});
	});

	it("setOverride rejects invalid bindings", () => {
		const store = createHotkeyOverridesStore();
		store.getState().setOverride("toggle-search", "Mod" as never);
		store.getState().setOverride("toggle-search", "" as never);
		expect(store.getState().overrides).toEqual({});

		store.getState().setOverride("toggle-search", "Mod+J");
		expect(store.getState().overrides["toggle-search"]).toBe("Mod+J");
	});
});
