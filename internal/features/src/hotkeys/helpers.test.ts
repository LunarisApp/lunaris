import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { createHotkeyOptions, getHotkeyBinding, getHotkeyMeta } from "./helpers";

const t = ((key: string) => `translated:${key}`) as TFunction;

describe("hotkey helpers", () => {
	it("resolves platform-specific delete bindings", () => {
		expect(getHotkeyBinding("delete-resource", "mac")).toBe("Mod+Backspace");
		expect(getHotkeyBinding("delete-resource", "windows")).toBe("Delete");
		expect(getHotkeyBinding("delete-resource", "linux")).toBe("Delete");
	});

	it("builds translated metadata for registrations", () => {
		expect(getHotkeyMeta("open-settings", t)).toEqual({
			hotkeyId: "open-settings",
			category: "general",
			name: "translated:common.settings",
			description: undefined,
		});
	});

	it("merges metadata with local hotkey options", () => {
		expect(
			createHotkeyOptions("toggle-search", t, {
				enabled: false,
				ignoreInputs: true,
			}),
		).toEqual({
			enabled: false,
			ignoreInputs: true,
			meta: {
				hotkeyId: "toggle-search",
				category: "general",
				name: "translated:commands.search",
				description: undefined,
			},
		});
	});
});
