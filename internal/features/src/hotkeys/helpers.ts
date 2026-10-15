import { getOperatingSystem } from "@repo/platform";
import type { Hotkey, UseHotkeyOptions } from "@tanstack/react-hotkeys";
import type { TFunction } from "i18next";
import { getHotkeyOverrides } from "./overrides";
import { HOTKEYS, type HotkeyCategory, type HotkeyDefinition, type HotkeyId, type HotkeyPlatform, isHotkeyId, type PlatformHotkey } from "./registry";

type AppHotkeyMeta = NonNullable<UseHotkeyOptions["meta"]> & {
	category: HotkeyCategory;
	hotkeyId: HotkeyId;
};

function getHotkeyDefinition(hotkey: HotkeyDefinition | HotkeyId): HotkeyDefinition {
	return typeof hotkey === "string" ? HOTKEYS[hotkey] : hotkey;
}

export function getHotkeyPlatform(): HotkeyPlatform | undefined {
	const platform = getOperatingSystem();
	return platform === "unknown" ? "linux" : platform;
}

export function getHotkeyBinding(
	hotkey: HotkeyDefinition | HotkeyId | PlatformHotkey,
	platform = getHotkeyPlatform(),
	overrides: Partial<Record<HotkeyId, Hotkey>> = getHotkeyOverrides(),
): Hotkey {
	if (typeof hotkey === "string") {
		if (isHotkeyId(hotkey)) {
			const override = overrides[hotkey];
			if (override) return override;
			return getHotkeyBinding(HOTKEYS[hotkey], platform, overrides);
		}

		return hotkey;
	}

	if ("id" in hotkey) {
		const override = overrides[hotkey.id];
		if (override) return override;
		return getHotkeyBinding(hotkey.key, platform, overrides);
	}

	if (platform && hotkey[platform]) {
		return hotkey[platform];
	}

	const fallback =
		hotkey.default ?? hotkey.mac ?? hotkey.windows ?? hotkey.linux;

	if (!fallback) {
		throw new Error("Hotkey definition must provide at least one platform binding");
	}

	return fallback;
}

export function getHotkeyMeta(
	hotkey: HotkeyDefinition | HotkeyId,
	t: TFunction,
): AppHotkeyMeta {
	const definition = getHotkeyDefinition(hotkey);

	return {
		hotkeyId: definition.id,
		category: definition.category,
		name: t(definition.nameKey),
		description: definition.descriptionKey ? t(definition.descriptionKey) : undefined,
	};
}

export function createHotkeyOptions(
	hotkey: HotkeyDefinition | HotkeyId,
	t: TFunction,
	options: UseHotkeyOptions = {},
): UseHotkeyOptions {
	return {
		...options,
		meta: {
			...getHotkeyMeta(hotkey, t),
			...options.meta,
		},
	};
}
