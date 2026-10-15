/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceExplorerButton } from "./workspace-explorer-button";

const openExplorer = vi.fn();

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openExplorer }),
  useOrganizationViewState: () => ({ isExplorerOpen: false }),
}));

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
  }) => {
    const trigger = render as ReactElement<{ children?: ReactNode }>;
    return cloneElement(trigger, undefined, children);
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "explorer.title" ? "Explorer" : key),
  }),
}));

describe("WorkspaceExplorerButton", () => {
  it("uses the Explorer label and opens the explorer", () => {
    render(<WorkspaceExplorerButton />);

    const button = screen.getByRole("button", { name: "Explorer" });
    expect(button.className).toContain("size-7");
    expect(button.className).toContain("hover:bg-muted");
    fireEvent.click(button);

    expect(screen.getAllByText("Explorer")).toHaveLength(2);
    expect(openExplorer).toHaveBeenCalledOnce();
  });
});
