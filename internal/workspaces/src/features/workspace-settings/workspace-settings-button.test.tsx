/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSettingsButton } from "./workspace-settings-button";

const openTool = vi.fn();

vi.mock("../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openTool }),
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
    t: (key: string) => (key === "common.settings" ? "Settings" : key),
  }),
}));

describe("WorkspaceSettingsButton", () => {
  it("uses the settings label and opens the workspace settings tool", () => {
    render(<WorkspaceSettingsButton />);

    const button = screen.getByRole("button", { name: "Settings" });
    expect(button.className).toContain("size-7");
    expect(button.className).toContain("hover:bg-muted");
    fireEvent.click(button);

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(openTool).toHaveBeenCalledWith({ toolId: "settings" });
  });
});
