import { useHotkey } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { HOTKEYS, useResolvedHotkeyBinding } from "@repo/features/hotkeys";
import { useGridLayoutStore } from "../context";

export function useMoveActivePanelToWindow(
  target: RefObject<HTMLElement | null>
) {
  const activePanelId = useGridLayoutStore((state) => state.activePanelId);
  const movePanelToWindow = useGridLayoutStore(
    (state) => state.movePanelToWindow
  );
  const hotkey = HOTKEYS["move-panel-to-new-window"];

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    () => {
      if (activePanelId) void movePanelToWindow(activePanelId);
    },
    {
      preventDefault: true,
      target,
    }
  );
}
