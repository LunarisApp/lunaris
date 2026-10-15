"use client";

import { useHotkey } from "@tanstack/react-hotkeys";
import { useTranslation } from "react-i18next";
import {
	createHotkeyOptions,
	HOTKEYS,
	type HotkeyId,
	useResolvedHotkeyBinding,
} from "@repo/features/hotkeys";
import type { CommandActions } from "./useCommandSearch";

function useCommandHotkey(
	hotkeyId: HotkeyId,
	action: (() => void) | undefined,
) {
	const { t } = useTranslation();
	const hotkey = HOTKEYS[hotkeyId];

	useHotkey(
		useResolvedHotkeyBinding(hotkey),
		() => action?.(),
		createHotkeyOptions(hotkey, t, { enabled: Boolean(action) }),
	);
}

/** Bind organization commands that do not own a dedicated feature hook. */
export function useCommandHotkeys(actions: CommandActions) {
	useCommandHotkey(
		"open-workspace-explorer",
		actions["open-workspace-explorer"],
	);
	useCommandHotkey("open-extensions", actions["open-extensions"]);
}
