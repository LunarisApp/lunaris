/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";

function wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

const captured = {
  callback: null as null | (() => void),
  key: null as null | string,
  options: null as null | Record<string, unknown>,
};

const openTool = vi.fn();

vi.mock("@tanstack/react-hotkeys", () => ({
  HotkeysProvider: ({ children }: { children: unknown }) => children,
  useHotkey: vi.fn(
    (key: string, callback: () => void, options?: Record<string, unknown>) => {
      captured.key = key;
      captured.callback = callback;
      captured.options = options ?? null;
    }
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "commands.debugger" ? "Debugger" : key),
  }),
}));

vi.mock("../organization-navigation", () => ({
  useOrganizationNavigation: () => ({
    openTool,
  }),
}));

describe("useDebuggerHotkey", () => {
  beforeEach(() => {
    openTool.mockReset();
    captured.callback = null;
    captured.key = null;
    captured.options = null;
  });

  it("binds Mod+Shift+D and opens the debugger tool", async () => {
    const { useDebuggerHotkey } = await import("./use-debugger-hotkey");

    renderHook(() => useDebuggerHotkey(), { wrapper });

    captured.callback?.();

    expect(captured.key).toBe("Mod+Shift+D");
    expect(captured.options).toEqual(
      expect.objectContaining({
        meta: expect.objectContaining({
          hotkeyId: "open-debugger",
          name: "Debugger",
        }),
      })
    );
    expect(openTool).toHaveBeenCalledWith({ toolId: "debugger" });
  });
});
