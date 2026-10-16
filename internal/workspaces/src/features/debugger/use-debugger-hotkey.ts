"use client";

import { useHotkey } from "@tanstack/react-hotkeys";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  createHotkeyOptions,
  HOTKEYS,
  useResolvedHotkeyBinding,
} from "@repo/features/hotkeys";
import { useOrganizationNavigation } from "../organization-navigation";
import { createOpenDebuggerPanelAction } from "./open-debugger";

export function useDebuggerHotkey() {
  const { t } = useTranslation();
  const { openTool } = useOrganizationNavigation();
  const hotkey = HOTKEYS["open-debugger"];

  const openDebugger = useMemo(
    () => createOpenDebuggerPanelAction({ openTool, t }),
    [openTool, t]
  );

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    openDebugger,
    createHotkeyOptions(hotkey, t)
  );
}
