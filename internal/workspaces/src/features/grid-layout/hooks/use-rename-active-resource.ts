import { useEffect } from "react";
import { useAppToolActive } from "@repo/features/appbar";
import { HOTKEYS, useResolvedHotkeyBinding } from "@repo/features/hotkeys";
import { useGridLayoutStore } from "../context";

/**
 * Hook that handles F2 to rename the active resource panel.
 * Uses capture-phase event listener to intercept before editors
 * like BlockNote/ProseMirror consume the event.
 * Only preventDefault when active panel is an item — otherwise
 * lets the event bubble so the tree rename handler can pick it up.
 */
export function useRenameActiveResource() {
  const appToolActive = useAppToolActive();
  const requestRenameActiveResource = useGridLayoutStore(
    (s) => s.requestRenameActiveResource
  );
  const dockviewApi = useGridLayoutStore((s) => s.dockviewApi);
  const key = useResolvedHotkeyBinding(HOTKEYS["rename-resource"]);

  useEffect(() => {
    if (!appToolActive) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === key) {
        const resourceId = dockviewApi?.activePanel?.params?.resourceId;
        if (resourceId) {
          e.preventDefault();
          e.stopPropagation();
          requestRenameActiveResource();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [appToolActive, requestRenameActiveResource, dockviewApi, key]);
}
