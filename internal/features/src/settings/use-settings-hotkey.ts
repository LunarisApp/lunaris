"use client";

import { useHotkey } from "@tanstack/react-hotkeys";
import { useTranslation } from "react-i18next";
import {
  createHotkeyOptions,
  HOTKEYS,
  useResolvedHotkeyBinding,
} from "../hotkeys";
import { useSettings } from "./context";

export function useSettingsHotkey() {
  const { t } = useTranslation();
  const { open } = useSettings();
  const hotkey = HOTKEYS["open-settings"];

  useHotkey(
    useResolvedHotkeyBinding(hotkey),
    open,
    createHotkeyOptions(hotkey, t, { preventDefault: true })
  );
}
