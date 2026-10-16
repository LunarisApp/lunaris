"use client";

import {
  type HotkeysProviderProps,
  HotkeysProvider as TanStackHotkeysProvider,
} from "@tanstack/react-hotkeys";
import { getHotkeyPlatform } from "./helpers";
import { HotkeyOverridesProvider } from "./overrides";

export function HotkeysProvider({
  children,
  defaultOptions,
}: HotkeysProviderProps) {
  return (
    <HotkeyOverridesProvider>
      <TanStackHotkeysProvider
        defaultOptions={{
          ...defaultOptions,
          hotkey: {
            platform: getHotkeyPlatform(),
            ...defaultOptions?.hotkey,
          },
        }}
      >
        {children}
      </TanStackHotkeysProvider>
    </HotkeyOverridesProvider>
  );
}
