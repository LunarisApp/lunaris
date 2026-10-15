/** @vitest-environment happy-dom */

import { HotkeyOverridesProvider } from "@repo/features/hotkeys";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseHotkey = vi.fn();
const addGroup = vi.fn(() => ({ id: "main" }));
const addPanel = vi.fn();
const dockviewApi: { activeGroup?: { id: string } } = {
  activeGroup: { id: "group-right" },
};
const groups: { id: string }[] = [];

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: (...args: unknown[]) => mockUseHotkey(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../context", () => ({
  useGridLayoutStore: (
    selector: (state: {
      addGroup: typeof addGroup;
      addPanel: typeof addPanel;
      dockviewApi: typeof dockviewApi;
      groups: typeof groups;
    }) => unknown
  ) => selector({ addGroup, addPanel, dockviewApi, groups }),
}));

import { useNewTabHotkey } from "./use-new-tab-hotkey";

function wrapper({ children }: { children: ReactNode }) {
  return <HotkeyOverridesProvider>{children}</HotkeyOverridesProvider>;
}

describe("useNewTabHotkey", () => {
  beforeEach(() => {
    addGroup.mockClear();
    addPanel.mockReset();
    dockviewApi.activeGroup = { id: "group-right" };
    groups.splice(0, groups.length, { id: "group-right" });
    mockUseHotkey.mockReset();
  });

  it("adds a new tab to the active workspace group on Mod+N", () => {
    renderHook(() => useNewTabHotkey(), { wrapper });

    expect(mockUseHotkey).toHaveBeenCalledWith(
      "Mod+N",
      expect.any(Function),
      expect.objectContaining({
        enabled: true,
        preventDefault: true,
        meta: expect.objectContaining({
          hotkeyId: "new-tab",
          name: "gridLayout.emptyPanel.title",
        }),
      })
    );

    const openNewTab = mockUseHotkey.mock.calls[0]?.[1] as () => void;
    openNewTab();

    expect(addPanel).toHaveBeenCalledWith({
      allowDuplicate: true,
      params: {},
      pluginId: "grid-layout",
      position: { direction: "within", referenceGroup: "group-right" },
      renderer: "empty-panel",
      title: "gridLayout.emptyPanel.title",
    });
  });

  it("uses the active group at keypress time", () => {
    renderHook(() => useNewTabHotkey(), { wrapper });
    dockviewApi.activeGroup = { id: "group-left" };

    const openNewTab = mockUseHotkey.mock.calls[0]?.[1] as () => void;
    openNewTab();

    expect(addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { direction: "within", referenceGroup: "group-left" },
      })
    );
  });

  it("recreates the main group when the workspace has no groups", () => {
    dockviewApi.activeGroup = undefined;
    groups.splice(0);
    renderHook(() => useNewTabHotkey(), { wrapper });

    const openNewTab = mockUseHotkey.mock.calls[0]?.[1] as () => void;
    openNewTab();

    expect(addGroup).toHaveBeenCalledWith({
      direction: "right",
      id: "main",
    });
    expect(addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { direction: "within", referenceGroup: "main" },
      })
    );
  });
});
