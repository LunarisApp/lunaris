/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const movePanelToWindow = vi.fn();

vi.mock("@lunarisapp/ui/components/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuShortcut: ({ children }: { children: ReactNode }) => (
    <kbd>{children}</kbd>
  ),
  ContextMenuTrigger: ({ render }: { render: ReactNode }) => render,
}));

vi.mock("dockview-react", () => ({
  DockviewDefaultTab: () => <div>Panel tab</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "gridLayout.tab.moveToNewWindow": "Move to New Window",
        "gridLayout.tab.close": "Close",
        "gridLayout.tab.closeOthers": "Close Others",
        "gridLayout.tab.closeAll": "Close All",
      })[key] ?? key,
  }),
}));

vi.mock("@repo/features/hotkeys", () => ({
  useHotkeyDisplay: (id: string) =>
    id === "move-panel-to-new-window" ? "⇧⌘N" : "⇧⌘W",
}));

vi.mock("../context", () => ({
  useGridLayoutStore: (
    selector: (state: {
      movePanelToWindow: typeof movePanelToWindow;
      movingPanelIds: Set<string>;
    }) => unknown
  ) => selector({ movePanelToWindow, movingPanelIds: new Set() }),
}));

describe("GridLayoutTab", () => {
  it("shows resolved shortcuts for moving and closing panels", async () => {
    const disposable = { dispose: vi.fn() };
    const api = {
      id: "panel-1",
      close: vi.fn(),
      setActive: vi.fn(),
      group: { panels: [] as unknown[] },
      onDidGroupChange: vi.fn(() => disposable),
    };
    api.group.panels = [{ id: api.id, api }];
    const props = {
      api,
      containerApi: {
        onDidAddPanel: vi.fn(() => disposable),
        onDidRemovePanel: vi.fn(() => disposable),
      },
    } as unknown as IDockviewPanelHeaderProps;
    const { GridLayoutTab } = await import("./tab");

    render(<GridLayoutTab {...props} />);

    expect(screen.getByText("⇧⌘N")).toBeTruthy();
    expect(screen.getByText("⇧⌘W")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Move to New Window ⇧⌘N",
      }).disabled
    ).toBe(false);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Close ⇧⌘W" })
        .disabled
    ).toBe(false);
  });
});
