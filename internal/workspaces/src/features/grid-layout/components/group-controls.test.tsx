/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IDockviewHeaderActionsProps } from "dockview";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const addPanel = vi.fn();

vi.mock("@lunarisapp/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({
    children,
    render,
  }: {
    children: ReactNode;
    render: ReactNode;
  }) => (
    <>
      {render}
      {children}
    </>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "gridLayout.emptyPanel.add": "New tab",
        "gridLayout.emptyPanel.title": "New tab",
      })[key] ?? key,
  }),
}));

vi.mock("@repo/features/hotkeys", () => ({
  useHotkeyDisplay: () => "⌘N",
}));

vi.mock("../context", () => ({
  useGridLayoutStore: (
    selector: (state: { addPanel: typeof addPanel }) => unknown
  ) => selector({ addPanel }),
}));

import { GridLayoutGroupControls } from "./group-controls";

describe("GridLayoutGroupControls", () => {
  it("adds a repeatable non-routable panel inside its group", async () => {
    const user = userEvent.setup();
    const props = {
      group: { id: "group-right" },
    } as unknown as IDockviewHeaderActionsProps;

    render(<GridLayoutGroupControls {...props} />);
    expect(screen.getByText("⌘N")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "New tab" }));

    expect(addPanel).toHaveBeenCalledWith({
      allowDuplicate: true,
      params: {},
      pluginId: "grid-layout",
      position: { direction: "within", referenceGroup: "group-right" },
      renderer: "empty-panel",
      title: "New tab",
    });
  });
});
