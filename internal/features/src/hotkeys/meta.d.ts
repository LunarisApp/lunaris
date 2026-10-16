import "@tanstack/hotkeys";
import type { HotkeyCategory, HotkeyId } from "./registry";

declare module "@tanstack/hotkeys" {
  interface HotkeyMeta {
    category?: HotkeyCategory;
    hotkeyId?: HotkeyId;
  }
}
