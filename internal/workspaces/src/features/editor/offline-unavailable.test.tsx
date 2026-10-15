import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceUnavailableOffline } from "./offline-unavailable";

const translations: Record<string, string> = {
  "editor.backToWorkspaces": "Back to workspaces",
  "editor.offlineUnavailableDescription":
    "This workspace hasn't been downloaded to this device yet. Connect to the internet to open it.",
  "editor.offlineUnavailableTitle": "Workspace unavailable offline",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe("WorkspaceUnavailableOffline", () => {
  it("explains why the workspace is unavailable and links back to workspaces", () => {
    render(
      <MemoryRouter>
        <WorkspaceUnavailableOffline backTo="/lunar" />
      </MemoryRouter>
    );

    expect(screen.getByTestId("workspace-unavailable-offline")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Workspace unavailable offline" })
    ).not.toBeNull();
    expect(
      screen.getByText(
        "This workspace hasn't been downloaded to this device yet. Connect to the internet to open it."
      )
    ).not.toBeNull();
    const backAction = screen.getByRole("button", {
      name: "Back to workspaces",
    });
    expect(backAction.tagName).toBe("A");
    expect(backAction.getAttribute("href")).toBe("/lunar");
  });
});
