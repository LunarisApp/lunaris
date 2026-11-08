import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceWebMcp } from "./workspace-webmcp";

const mocks = vi.hoisted(() => ({
  content: { activeWorkspaceId: "workspace-1", activeResourceId: "resource-1" },
  contributions: {
    subscribe: vi.fn(() => () => undefined),
    getVersion: () => 1,
    getResourceTypes: () => [{ extensionId: "rich-text" }],
  },
  register: vi
    .fn<
      (options: {
        signal: AbortSignal;
        content: { activeWorkspaceId: string };
        enabledPluginIds: Set<string>;
      }) => Promise<void>
    >()
    .mockResolvedValue(undefined),
  resources: new Map(),
  warn: vi.fn(),
}));
vi.mock("@lunarisapp/plugin-sdk/internal", () => ({
  usePluginSdkRuntime: () => ({
    contributions: mocks.contributions,
    host: {
      useLunarisContent: () => mocks.content,
      useWorkspaceResourcesMap: () => mocks.resources,
      useOrganizationNavigation: () => ({ openResource: vi.fn() }),
    },
  }),
}));
vi.mock("./webmcp-files", () => ({ readWebMcpFile: vi.fn() }));
vi.mock("./webmcp", () => ({
  getWebMcpContext: () => ({ registerTool: vi.fn() }),
  registerWorkspaceWebMcp: mocks.register,
}));
vi.mock("@repo/features/permissions", () => ({ usePermission: () => true }));
vi.mock("@repo/data/core", () => ({ usePowerSync: () => ({}) }));
vi.mock("evlog", () => ({ log: { warn: mocks.warn } }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("WebMCP workspace lifecycle", () => {
  it("aborts registrations on unmount and replaces stale context", () => {
    const { rerender, unmount } = render(<WorkspaceWebMcp />);
    const first = mocks.register.mock.calls[0]![0];
    expect(first.enabledPluginIds).toEqual(new Set(["rich-text"]));
    mocks.content = {
      activeWorkspaceId: "workspace-2",
      activeResourceId: "resource-2",
    };
    rerender(<WorkspaceWebMcp />);
    expect(first.signal.aborted).toBe(true);
    const second = mocks.register.mock.calls[1]![0];
    expect(second.content.activeWorkspaceId).toBe("workspace-2");
    unmount();
    expect(second.signal.aborted).toBe(true);
  });

  it("cleans up partial registrations when browser registration fails", async () => {
    mocks.register.mockRejectedValueOnce(
      new Error("Browser rejected registration")
    );
    const { unmount } = render(<WorkspaceWebMcp />);
    await waitFor(() => expect(mocks.warn).toHaveBeenCalledOnce());
    expect(mocks.register.mock.calls[0]![0].signal.aborted).toBe(true);
    unmount();
  });

  it("ignores registration cancellation during navigation", async () => {
    mocks.register.mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError")
    );
    const { unmount } = render(<WorkspaceWebMcp />);
    await act(async () => unmount());
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
