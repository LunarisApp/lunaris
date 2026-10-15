/** @vitest-environment happy-dom */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  workspaceSyncMock,
  useWorkspaceBySlugQueryMock,
  useSyncAccessMock,
  useParamsMock,
} = vi.hoisted(() => ({
  workspaceSyncMock: vi.fn(),
  useParamsMock: vi.fn(),
  useWorkspaceBySlugQueryMock: vi.fn(),
  useSyncAccessMock: vi.fn(),
}));

vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud", localOnly: "local-only" },
  useSyncAccess: useSyncAccessMock,
}));

vi.mock("@repo/data/features/workspaces", () => ({
  WORKSPACE_INDEX_SYNC_STREAMS: [
    { name: "workspace_index", waitForStream: true },
  ],
  useWorkspaceBySlugQuery: useWorkspaceBySlugQueryMock,
  useWorkspaceSync: workspaceSyncMock,
}));

vi.mock("react-router", () => ({
  useParams: useParamsMock,
}));

import { WorkspaceProvider, useCurrentWorkspace } from ".";

const workspace = {
  created_at: "2026-01-01T00:00:00.000Z",
  id: "workspace_1",
  name: "Atlas",
  organization_id: "org_1",
  slug: "atlas",
  updated_at: "2026-01-01T00:00:00.000Z",
  visibility: "shared",
};

let isOnline = true;

function createWorkspaceSyncState(hasSynced: boolean, isLoading: boolean) {
  return {
    hasSynced,
    isLoading,
    streams: {
      workspace_content: { hasSynced, isLoading },
    },
  };
}

function Consumer() {
  const current = useCurrentWorkspace();
  return (
    <output role="status">
      {JSON.stringify({
        isLoading: current.isLoading,
        isUnavailableOffline: current.isUnavailableOffline,
        workspaceId: current.workspaceId,
        workspaceName: current.workspace?.name ?? null,
      })}
    </output>
  );
}

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isOnline = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => isOnline);
    useParamsMock.mockReturnValue({ workspaceSlug: "atlas" });
    useSyncAccessMock.mockReturnValue("cloud");
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });
    workspaceSyncMock.mockReturnValue(createWorkspaceSyncState(true, false));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes workspace stream wait options in cloud mode", () => {
    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(useWorkspaceBySlugQueryMock).toHaveBeenCalledWith("atlas", "org_1", {
      streams: [{ name: "workspace_index", waitForStream: true }],
    });
  });

  it("does not pass stream wait options in local-only mode", () => {
    useSyncAccessMock.mockReturnValue("local-only");

    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(useWorkspaceBySlugQueryMock).toHaveBeenCalledWith("atlas", "org_1", {
      streams: undefined,
    });
  });

  it("exposes loading state without implying not-found", () => {
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [],
      error: undefined,
      isFetching: false,
      isLoading: true,
    });

    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":true'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"workspaceName":null'
    );
  });

  it("settles to no workspace after empty query", () => {
    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"workspaceName":null'
    );
  });

  it("keeps matched workspace loading until workspace streams sync", () => {
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });
    workspaceSyncMock.mockReturnValue(createWorkspaceSyncState(false, false));

    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":true'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"isUnavailableOffline":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"workspaceName":"Atlas"'
    );
  });

  it("marks an unsynced cloud workspace unavailable while offline", () => {
    isOnline = false;
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });
    workspaceSyncMock.mockReturnValue(createWorkspaceSyncState(false, false));

    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"isUnavailableOffline":true'
    );
  });

  it("keeps a previously synced cloud workspace available offline", () => {
    isOnline = false;
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"isUnavailableOffline":false'
    );
  });

  it("keeps a local-only workspace available offline", () => {
    isOnline = false;
    useSyncAccessMock.mockReturnValue("local-only");
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [{ ...workspace, visibility: "local" }],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });
    workspaceSyncMock.mockReturnValue(createWorkspaceSyncState(false, true));

    render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"isUnavailableOffline":false'
    );
  });

  it("keeps an open workspace mounted while streams resync", () => {
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    const { rerender } = render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":false'
    );

    workspaceSyncMock.mockReturnValue(createWorkspaceSyncState(false, true));
    rerender(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"isUnavailableOffline":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"workspaceName":"Atlas"'
    );
  });

  it("returns to loading on reconnect, then resolves after streams sync", () => {
    isOnline = false;
    useWorkspaceBySlugQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });
    workspaceSyncMock.mockReturnValue(createWorkspaceSyncState(false, false));

    const { rerender } = render(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isUnavailableOffline":true'
    );

    act(() => {
      isOnline = true;
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":true'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"isUnavailableOffline":false'
    );

    workspaceSyncMock.mockReturnValue(createWorkspaceSyncState(true, false));
    rerender(
      <WorkspaceProvider organizationId="org_1">
        <Consumer />
      </WorkspaceProvider>
    );

    expect(screen.getByRole("status").textContent).toContain(
      '"isLoading":false'
    );
    expect(screen.getByRole("status").textContent).toContain(
      '"workspaceName":"Atlas"'
    );
  });
});
