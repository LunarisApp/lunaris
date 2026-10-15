/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceTrashButton } from "./workspace-trash-button";

const { openTool } = vi.hoisted(() => ({ openTool: vi.fn() }));

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openTool }),
}));
vi.mock("../store", () => ({
  useWorkspaceTrashMap: () =>
    new Map([
      ["root_1", { id: "root_1", trash_root_id: "root_1" }],
      ["child_1", { id: "child_1", trash_root_id: "root_1" }],
    ]),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("WorkspaceTrashButton", () => {
  it("shows the root count and opens the routable Trash tool", () => {
    render(<WorkspaceTrashButton />);

    expect(screen.getByText("1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workspace-trash-trigger"));
    expect(openTool).toHaveBeenCalledWith({ toolId: "trash" });
  });
});
