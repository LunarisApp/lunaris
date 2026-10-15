import { useHotkey } from "@tanstack/react-hotkeys";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createHotkeyOptions, HOTKEYS, useResolvedHotkeyBinding } from "@repo/features/hotkeys";
import { useGridLayoutStore } from "../context";

/**
 * Binds focus mode hotkeys, syncs dockview maximize state,
 * and sets `data-focus-mode` on `document.documentElement` for CSS targeting.
 */
export function useFocusMode() {
  const { t } = useTranslation();
  const toggleFocusMode = useGridLayoutStore((s) => s.toggleFocusMode);
  const exitFocusMode = useGridLayoutStore((s) => s.exitFocusMode);
  const dockviewApi = useGridLayoutStore((s) => s.dockviewApi);
  const isFocusMode = useGridLayoutStore((s) => s.isFocusMode);
  const hotkey = HOTKEYS["toggle-focus-mode"];

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    toggleFocusMode,
    createHotkeyOptions(hotkey, t)
  );

  useHotkey("Escape", exitFocusMode, {
    enabled: isFocusMode,
    preventDefault: false,
    stopPropagation: false,
  });

  // Sync isFocusMode when dockview maximize state changes externally
  useEffect(() => {
    if (!dockviewApi) return;

    const disposable = dockviewApi.onDidMaximizedGroupChange((e) => {
      if (!e.isMaximized) {
        exitFocusMode();
      }
    });

    return () => disposable.dispose();
  }, [dockviewApi, exitFocusMode]);

  // Set data attribute on root for CSS-driven focus mode
  useEffect(() => {
    if (isFocusMode) {
      document.documentElement.setAttribute("data-focus-mode", "");
    } else {
      document.documentElement.removeAttribute("data-focus-mode");
    }
    return () => document.documentElement.removeAttribute("data-focus-mode");
  }, [isFocusMode]);
}
