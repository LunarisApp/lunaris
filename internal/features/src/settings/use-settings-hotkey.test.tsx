/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "../hotkeys";

const captured = {
  callback: null as null | (() => void),
  key: null as null | string,
  options: null as null | Record<string, unknown>,
};
const navigate = vi.fn();
const postHogCapture = vi.fn();

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

vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => postHogCapture(...args) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "common.settings" ? "Settings" : key),
  }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => navigate,
}));

function wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

describe("useSettingsHotkey", () => {
  beforeEach(() => {
    captured.callback = null;
    captured.key = null;
    captured.options = null;
    navigate.mockReset();
    postHogCapture.mockReset();
  });

  it("binds Mod+, and opens app settings", async () => {
    const { useSettingsHotkey } = await import("./use-settings-hotkey");

    renderHook(() => useSettingsHotkey(), { wrapper });
    captured.callback?.();

    expect(captured.key).toBe("Mod+,");
    expect(captured.options).toEqual(
      expect.objectContaining({
        preventDefault: true,
        meta: expect.objectContaining({
          hotkeyId: "open-settings",
          category: "general",
          name: "Settings",
        }),
      })
    );
    expect(postHogCapture).toHaveBeenCalledWith("settings_opened");
    expect(navigate).toHaveBeenCalledWith("/settings");
  });
});
