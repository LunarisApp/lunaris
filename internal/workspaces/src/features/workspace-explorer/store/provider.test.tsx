/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useWorkspaceResourcesSuspenseQueryMock,
  useWorkspaceTrashSuspenseQueryMock,
} = vi.hoisted(() => ({
  useWorkspaceResourcesSuspenseQueryMock: vi.fn(),
  useWorkspaceTrashSuspenseQueryMock: vi.fn(),
}));

vi.mock("@repo/data/core", () => ({
  usePowerSync: () => ({}),
}));

vi.mock("@repo/data/features/workspace-resources", () => ({
  getWorkspaceResourcesSyncStreams: () => [
    {
      name: "workspace_index",
      waitForStream: true,
    },
  ],
  getExpiredLocalTrashRootIds: vi.fn().mockResolvedValue([]),
  useWorkspaceResourceTrashSuspenseQuery: useWorkspaceTrashSuspenseQueryMock,
  useWorkspaceResourcesSuspenseQuery: useWorkspaceResourcesSuspenseQueryMock,
}));

vi.mock("evlog", () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@repo/features/api", () => ({
  useApi: () => ({}),
}));

vi.mock("@repo/features/auth", () => ({
  useAuth: () => ({
    useSession: () => ({ data: { user: { id: "user-1" } } }),
  }),
}));

vi.mock("@repo/features/entitlements", () => ({
  useReserveResourceCapacity: () => vi.fn(),
}));

vi.mock("../../organization-navigation", () => ({
  useOrganizationNavigation: () => ({
    closeViewInstances: vi.fn(),
    setResourceTitle: vi.fn(),
  }),
}));

vi.mock("../../search", () => ({
  removeRecentFilesByResourceIds: vi.fn(),
}));

vi.mock("./actions", () => ({
  createBoundActions: vi.fn(() => ({ purgeResources: vi.fn() })),
}));

import { WorkspaceExplorerProvider } from "./provider";

describe("WorkspaceExplorerProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceResourcesSuspenseQueryMock.mockReturnValue({ data: [] });
    useWorkspaceTrashSuspenseQueryMock.mockReturnValue({ data: [] });
  });

  it("waits for the organization index before exposing explorer resources", () => {
    render(
      <WorkspaceExplorerProvider workspaceId="workspace_1">
        <div>ready</div>
      </WorkspaceExplorerProvider>
    );

    expect(screen.getByText("ready")).toBeTruthy();
    expect(useWorkspaceResourcesSuspenseQueryMock).toHaveBeenCalledWith(
      "workspace_1",
      {
        streams: [
          {
            name: "workspace_index",
            waitForStream: true,
          },
        ],
      }
    );
  });

  it("does not wait for organization index when sync wait is disabled", () => {
    render(
      <WorkspaceExplorerProvider workspaceId="workspace_1" waitForSync={false}>
        <div>ready</div>
      </WorkspaceExplorerProvider>
    );

    expect(screen.getByText("ready")).toBeTruthy();
    expect(useWorkspaceResourcesSuspenseQueryMock).toHaveBeenCalledWith(
      "workspace_1",
      undefined
    );
  });
});
