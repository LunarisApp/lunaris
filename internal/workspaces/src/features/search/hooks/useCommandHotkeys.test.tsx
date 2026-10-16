/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";
import type { CommandActions } from "./useCommandSearch";

function wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

const captured: Array<{
  callback: () => void;
  key: string;
  options?: Record<string, unknown>;
}> = [];

vi.mock("@tanstack/react-hotkeys", () => ({
  HotkeysProvider: ({ children }: { children: unknown }) => children,
  useHotkey: vi.fn(
    (key: string, callback: () => void, options?: Record<string, unknown>) =>
      captured.push({ callback, key, options })
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("useCommandHotkeys", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("binds and runs organization navigation commands", async () => {
    const openExtensions = vi.fn();
    const openExplorer = vi.fn();
    const actions: CommandActions = {
      "open-extensions": openExtensions,
      "open-workspace-explorer": openExplorer,
    };
    const { useCommandHotkeys } = await import("./useCommandHotkeys");

    renderHook(() => useCommandHotkeys(actions), { wrapper });

    expect(captured.map(({ key }) => key)).toEqual([
      "Mod+Shift+E",
      "Mod+Shift+X",
    ]);
    captured[0]?.callback();
    captured[1]?.callback();
    expect(openExplorer).toHaveBeenCalledOnce();
    expect(openExtensions).toHaveBeenCalledOnce();
    expect(captured[0]?.options).toEqual(
      expect.objectContaining({
        enabled: true,
        meta: expect.objectContaining({
          hotkeyId: "open-workspace-explorer",
        }),
      })
    );
  });

  it("disables bindings without available actions", async () => {
    const { useCommandHotkeys } = await import("./useCommandHotkeys");

    renderHook(() => useCommandHotkeys({}), { wrapper });

    expect(captured).toHaveLength(2);
    expect(captured.every(({ options }) => options?.enabled === false)).toBe(
      true
    );
  });
});
