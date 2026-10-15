import { describe, expect, it } from "vitest";

describe("formatHotkeyDisplay", () => {
	it("formats registry hotkeys for non-Mac", async () => {
		const { formatHotkeyDisplay } = await import("./display");
		expect(formatHotkeyDisplay("toggle-search", "windows")).toBe("Ctrl+K");
	});

	it("formats comma key", async () => {
		const { formatHotkeyDisplay } = await import("./display");
		expect(formatHotkeyDisplay("open-settings", "windows")).toBe(
			"Ctrl+,",
		);
	});

	it("formats platform-specific delete keys", async () => {
		const { formatHotkeyDisplay } = await import("./display");
		expect(formatHotkeyDisplay("delete-resource", "windows")).toBe("Delete");
		expect(formatHotkeyDisplay("delete-resource", "mac")).toBe("⌘⌫");
	});

	it("still formats raw keys directly", async () => {
		const { formatHotkeyDisplay } = await import("./display");
		expect(formatHotkeyDisplay("F1", "windows")).toBe("F1");
	});

	it("formats macOS Control shortcuts with the standard symbol", async () => {
		const { formatHotkeyDisplay } = await import("./display");
		expect(formatHotkeyDisplay("Control+1", "mac")).toBe("⌃1");
	});
});
