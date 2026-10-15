import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
	useTheme: () => ({ setTheme: vi.fn(), theme: "system" }),
}));

vi.mock("posthog-js", () => ({
	default: { capture: vi.fn() },
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../debug-logging/context", () => ({
	useDebugLogging: () => ({ debugLogging: false, setDebugLogging: vi.fn() }),
}));

vi.mock("../../font-family/context", () => ({
	useFontFamily: () => ({ fontFamily: "default", setFontFamily: vi.fn() }),
}));

vi.mock("../../font-size/context", () => ({
	useFontSize: () => ({ fontSize: "compact", setFontSize: vi.fn() }),
}));

vi.mock("../../locale/context", () => ({
	useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("../../locale/i18n", () => ({
	SUPPORTED_LOCALES: [{ code: "en", label: "English", nativeLabel: "English" }],
}));

import { PreferencesContent } from "./preferences";

describe("PreferencesContent accessibility", () => {
	it("labels preference controls and preserves heading order", () => {
		render(<PreferencesContent />);

		expect(
			screen.getByRole("radiogroup", {
				name: "settings.preferences.themeMode",
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("radiogroup", {
				name: "settings.preferences.fontSize",
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("radiogroup", {
				name: "settings.preferences.font",
			}),
		).toBeTruthy();
		for (const name of [
			"settings.preferences.themeSystem",
			"settings.preferences.themeLight",
			"settings.preferences.themeDark",
			"settings.preferences.fontSizeCompact",
			"settings.preferences.fontSizeLarge",
			"settings.preferences.fontSizeExtraLarge",
			"settings.preferences.fontDefault",
			"settings.preferences.fontSerif",
			"settings.preferences.fontDyslexic",
		]) {
			expect(screen.getByRole("radio", { name })).toBeTruthy();
		}
		expect(
			screen.getByRole("combobox", {
				name: "settings.preferences.language",
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("switch", {
				name: "settings.preferences.debugLogging",
				description: "settings.preferences.debugLoggingDescription",
			}),
		).toBeTruthy();
		expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
	});
});
