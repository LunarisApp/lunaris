import { getHotkeyBinding, getHotkeyPlatform } from "./helpers";
import {
  type HotkeyDefinition,
  type HotkeyId,
  type HotkeyPlatform,
  isHotkeyId,
} from "./registry";

function formatResolvedHotkeyDisplay(
  key: string,
  platform: HotkeyPlatform | undefined
): string {
  const isMac = platform === "mac";

  if (isMac) {
    return key
      .replace(/Mod/g, "⌘")
      .replace(/Control|Ctrl/g, "⌃")
      .replace(/Alt/g, "⌥")
      .replace(/Shift/g, "⇧")
      .replace(/Backspace/g, "⌫")
      .replace(/\+/g, "");
  }

  return key.replace(/Mod/g, "Ctrl");
}
export function formatHotkeyDisplay(
  hotkey: string | HotkeyDefinition | HotkeyId,
  platform?: HotkeyPlatform
): string;
/** Convert a hotkey registration or key string to a platform-specific display string. */
export function formatHotkeyDisplay(
  hotkey: HotkeyDefinition | HotkeyId | string,
  platform = getHotkeyPlatform()
): string {
  if (typeof hotkey === "string" && isHotkeyId(hotkey)) {
    return formatResolvedHotkeyDisplay(
      getHotkeyBinding(hotkey, platform),
      platform
    );
  }

  if (typeof hotkey === "object") {
    return formatResolvedHotkeyDisplay(
      getHotkeyBinding(hotkey, platform),
      platform
    );
  }

  return formatResolvedHotkeyDisplay(hotkey, platform);
}
