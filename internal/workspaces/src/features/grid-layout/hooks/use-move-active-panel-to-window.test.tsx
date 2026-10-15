/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";

function wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

const mockUseHotkey = vi.fn();
const movePanelToWindow = vi.fn();
let activePanelId: string | null = "panel-1";

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: (...args: unknown[]) => mockUseHotkey(...args),
}));

vi.mock("../context", () => ({
  useGridLayoutStore: (
    selector: (state: {
      activePanelId: string | null;
      movePanelToWindow: (id: string) => Promise<void>;
    }) => unknown
  ) => selector({ activePanelId, movePanelToWindow }),
}));

describe("useMoveActivePanelToWindow", () => {
  beforeEach(() => {
    activePanelId = "panel-1";
    mockUseHotkey.mockReset();
    movePanelToWindow.mockReset();
    movePanelToWindow.mockResolvedValue(undefined);
  });

  it("binds Mod+Shift+N to the provided Dockview target", async () => {
    const target = createRef<HTMLDivElement>();
    const { useMoveActivePanelToWindow } = await import(
      "./use-move-active-panel-to-window"
    );

    renderHook(() => useMoveActivePanelToWindow(target), { wrapper });

    expect(mockUseHotkey).toHaveBeenCalledWith(
      "Mod+Shift+N",
      expect.any(Function),
      expect.objectContaining({
        preventDefault: true,
        target,
      })
    );

    const handler = mockUseHotkey.mock.calls[0]?.[1] as () => void;
    handler();
    expect(movePanelToWindow).toHaveBeenCalledWith("panel-1");
  });

  it("does nothing when no panel is active", async () => {
    activePanelId = null;
    const target = createRef<HTMLDivElement>();
    const { useMoveActivePanelToWindow } = await import(
      "./use-move-active-panel-to-window"
    );

    renderHook(() => useMoveActivePanelToWindow(target), { wrapper });

    const handler = mockUseHotkey.mock.calls[0]?.[1] as () => void;
    handler();
    expect(movePanelToWindow).not.toHaveBeenCalled();
  });
});
