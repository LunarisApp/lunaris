/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionViewLaunchers } from "./extension-view-launchers";

const {
  logDebugMock,
  openViewMock,
  preloadMock,
  useOrganizationViewStateMock,
  useViewsMock,
} = vi.hoisted(() => ({
  logDebugMock: vi.fn(),
  openViewMock: vi.fn(),
  preloadMock: vi.fn(),
  useOrganizationViewStateMock: vi.fn(),
  useViewsMock: vi.fn(),
}));

vi.mock("evlog", () => ({
  log: { debug: logDebugMock },
  parseError: (error: unknown) => error,
}));

vi.mock("@lunarisapp/plugin-sdk", () => ({
  createViewInstanceId: (id: string) => `view:${id}`,
  useViews: useViewsMock,
}));

vi.mock("@lunarisapp/ui/icons", () => ({
  HugeiconsIcon: () => null,
}));

vi.mock("@repo/workspaces/organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openView: openViewMock }),
  useOrganizationViewState: useOrganizationViewStateMock,
}));

describe("ExtensionViewLaunchers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOrganizationViewStateMock.mockReturnValue({ activeViewInstanceId: null });
    useViewsMock.mockReturnValue([
      {
        definition: {
          icon: {},
          name: "Assistant",
          preload: preloadMock,
          renderer: () => null,
          target: {
            kind: "standalone",
            launcher: { defaultPlacement: "secondary" },
          },
          viewId: "acme.assistant",
        },
        extensionId: "acme",
      },
    ]);
  });

  it("matches the active leading navigation button style", () => {
    useOrganizationViewStateMock.mockReturnValue({
      activeViewInstanceId: "view:acme.assistant",
    });

    render(<ExtensionViewLaunchers />);

    const launcher = screen.getByRole("button", { name: "Assistant" });
    expect(launcher.className).toContain("bg-sidebar-accent");
    expect(launcher.className).toContain("text-sidebar-accent-foreground");
  });

  it("opens a view from its static launcher", () => {
    render(<ExtensionViewLaunchers />);

    const launcher = screen.getByRole("button", { name: "Assistant" });
    expect(launcher.className).toContain("hover:bg-muted");
    expect(launcher.className).not.toContain("border-border");
    fireEvent.click(launcher);

    expect(openViewMock).toHaveBeenCalledWith({
      placement: "secondary",
      extensionId: "acme",
      title: "Assistant",
      viewId: "acme.assistant",
    });
  });

  it("preloads a view once on focus or pointer intent", () => {
    preloadMock.mockResolvedValue(undefined);
    render(<ExtensionViewLaunchers />);
    const launcher = screen.getByRole("button", { name: "Assistant" });

    fireEvent.pointerEnter(launcher);
    expect(preloadMock).toHaveBeenCalledOnce();
    fireEvent.focus(launcher);
    fireEvent.pointerDown(launcher);

    expect(preloadMock).toHaveBeenCalledOnce();
  });

  it("retries view preload after a failure", async () => {
    preloadMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    render(<ExtensionViewLaunchers />);
    const launcher = screen.getByRole("button", { name: "Assistant" });

    fireEvent.focus(launcher);
    await vi.waitFor(() => expect(preloadMock).toHaveBeenCalledOnce());
    fireEvent.pointerDown(launcher);

    await vi.waitFor(() => expect(preloadMock).toHaveBeenCalledTimes(2));
    expect(logDebugMock).toHaveBeenCalledWith({
      action: "extension_view.preload",
      outcome: "failure",
      extension: { id: "acme" },
      view: { id: "acme.assistant" },
      error: expect.objectContaining({ message: "offline" }),
    });
  });
});
