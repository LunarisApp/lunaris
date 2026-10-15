import { useHotkey } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { HOTKEYS, useResolvedHotkeyBinding } from "@repo/features/hotkeys";
import { useGridLayoutStore } from "../context";

export function useCloseActivePanel(target: RefObject<HTMLElement | null>) {
  const closeActivePanel = useGridLayoutStore((s) => s.closeActivePanel);
  const hotkey = HOTKEYS["close-tab"];

  useHotkey(useResolvedHotkeyBinding(hotkey), closeActivePanel, {
    preventDefault: true,
    target,
  });
}
