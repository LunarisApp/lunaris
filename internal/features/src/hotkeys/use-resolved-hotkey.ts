"use client";

import type { Hotkey } from "@tanstack/react-hotkeys";
import { formatHotkeyDisplay } from "./display";
import { getHotkeyBinding, getHotkeyPlatform } from "./helpers";
import { useHotkeyOverrides } from "./overrides";
import type { HotkeyDefinition, HotkeyId, HotkeyPlatform } from "./registry";

/**
 * Resolves a hotkey to its current binding, subscribing to override changes
 * so `useHotkey` consumers re-register when a user customizes the shortcut.
 */
export function useResolvedHotkeyBinding(
	hotkey: HotkeyDefinition | HotkeyId,
	platform: HotkeyPlatform | undefined = getHotkeyPlatform(),
): Hotkey {
	const overrides = useHotkeyOverrides((s) => s.overrides);
	return getHotkeyBinding(hotkey, platform, overrides);
}

/**
 * Returns a platform-formatted display string for a hotkey, subscribing to
 * override changes so UI labels (menus, badges) stay in sync after rebinding.
 */
export function useHotkeyDisplay(
	hotkey: HotkeyDefinition | HotkeyId,
	platform: HotkeyPlatform | undefined = getHotkeyPlatform(),
): string {
	const binding = useResolvedHotkeyBinding(hotkey, platform);
	return formatHotkeyDisplay(binding, platform);
}
