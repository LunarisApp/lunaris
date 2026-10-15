/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HotkeyOverridesProvider } from "@repo/features/hotkeys";

function wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

const mockUseHotkey = vi.fn();
const closeActivePanel = vi.fn();

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: (...args: unknown[]) => mockUseHotkey(...args),
}));

vi.mock("../context", () => ({
  useGridLayoutStore: (
    selector: (state: { closeActivePanel: () => void }) => unknown
  ) => selector({ closeActivePanel }),
}));

describe("useCloseActivePanel", () => {
  beforeEach(() => {
    mockUseHotkey.mockReset();
    closeActivePanel.mockReset();
  });

  it("binds Mod+Shift+W to the provided Dockview target", async () => {
    const target = createRef<HTMLDivElement>();

    const { useCloseActivePanel } = await import("./use-close-active-panel");

    renderHook(() => useCloseActivePanel(target), { wrapper });

    expect(mockUseHotkey).toHaveBeenCalledWith(
      "Mod+Shift+W",
      closeActivePanel,
      expect.objectContaining({
        preventDefault: true,
        target,
      })
    );
  });
});
