/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceOptionsMenu } from "./workspace-options-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("WorkspaceOptionsMenu", () => {
  it("contains only settings and delete actions", () => {
    render(
      <WorkspaceOptionsMenu
        canDelete
        onDelete={vi.fn()}
        onSettings={vi.fn()}
        workspaceName="Atlas"
      />
    );

    fireEvent.click(screen.getByTestId("workspaces-options-trigger"));

    expect(screen.getByTestId("workspaces-options-settings")).toBeTruthy();
    expect(screen.getByTestId("workspaces-options-delete")).toBeTruthy();
    expect(screen.queryByText("common.rename")).toBeNull();
    expect(screen.queryByText("workspaces.shareWorkspace")).toBeNull();
    expect(
      screen.getByRole("button", { name: "common.actions: Atlas" })
    ).toBeTruthy();
  });
});
