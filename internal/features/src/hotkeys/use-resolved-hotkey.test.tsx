import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { HotkeyOverridesProvider, useHotkeyOverrides } from "./overrides";
import {
  useHotkeyDisplay,
  useResolvedHotkeyBinding,
} from "./use-resolved-hotkey";

afterEach(() => {
  window.localStorage.clear();
});

function wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

describe("useResolvedHotkeyBinding", () => {
  it("returns the default binding when no override is set", () => {
    const { result } = renderHook(
      () => useResolvedHotkeyBinding("toggle-search", "windows"),
      { wrapper }
    );
    expect(result.current).toBe("Mod+K");
  });

  it("re-renders with the override when the store changes", () => {
    const { result } = renderHook(
      () => ({
        binding: useResolvedHotkeyBinding("toggle-search", "windows"),
        setOverride: useHotkeyOverrides((s) => s.setOverride),
      }),
      { wrapper }
    );

    expect(result.current.binding).toBe("Mod+K");

    act(() => {
      result.current.setOverride("toggle-search", "Mod+J");
    });

    expect(result.current.binding).toBe("Mod+J");
  });

  it("reverts when override is cleared", () => {
    const { result } = renderHook(
      () => ({
        binding: useResolvedHotkeyBinding("toggle-search", "windows"),
        setOverride: useHotkeyOverrides((s) => s.setOverride),
        clearOverride: useHotkeyOverrides((s) => s.clearOverride),
      }),
      { wrapper }
    );

    act(() => {
      result.current.setOverride("toggle-search", "Mod+J");
    });
    expect(result.current.binding).toBe("Mod+J");

    act(() => {
      result.current.clearOverride("toggle-search");
    });
    expect(result.current.binding).toBe("Mod+K");
  });
});

describe("useHotkeyDisplay", () => {
  it("formats with platform + subscribes to overrides", () => {
    const { result } = renderHook(
      () => ({
        label: useHotkeyDisplay("toggle-search", "windows"),
        setOverride: useHotkeyOverrides((s) => s.setOverride),
      }),
      { wrapper }
    );

    expect(result.current.label).toBe("Ctrl+K");

    act(() => {
      result.current.setOverride("toggle-search", "Mod+J");
    });

    expect(result.current.label).toBe("Ctrl+J");
  });
});
