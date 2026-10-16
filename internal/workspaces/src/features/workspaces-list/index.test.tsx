/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacesList } from ".";

const LOADING_DELAY_MS = 250;

const { useWorkspaceSyncMock, useWorkspacesQueryMock, useSyncAccessMock } =
  vi.hoisted(() => ({
    useWorkspaceSyncMock: vi.fn(),
    useWorkspacesQueryMock: vi.fn(),
    useSyncAccessMock: vi.fn(),
  }));

vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud", localOnly: "local-only" },
  useSyncAccess: useSyncAccessMock,
}));

vi.mock("@repo/data/features/workspaces", async () => ({
  WORKSPACE_INDEX_SYNC_STREAMS: [
    { name: "workspace_index", waitForStream: true },
  ],
  useWorkspaceSync: useWorkspaceSyncMock,
  useWorkspacesQuery: useWorkspacesQueryMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "workspaces.noWorkspaces": "No workspaces yet",
        "workspaces.noWorkspacesDescription":
          "Create your first workspace to get started",
        "workspaces.noSearchResults": "No matching workspaces",
        "workspaces.recentWorkspaces": "Recent Workspaces",
      })[key] ?? key,
  }),
}));

vi.mock("./components/workspace-resource", () => ({
  WorkspaceResource: ({
    onWorkspaceIntent,
    workspace,
    view,
  }: {
    onWorkspaceIntent: (workspace: {
      id: string;
      name: string;
      slug: string;
    }) => void;
    workspace: { id: string; name: string; slug: string };
    view: "grid" | "list";
  }) => (
    <div
      data-testid={`workspaces-list-item-${workspace.slug}`}
      data-view={view}
      onFocus={() => onWorkspaceIntent(workspace)}
      onPointerDown={() => onWorkspaceIntent(workspace)}
      role="listitem"
    >
      <button type="button">{workspace.name}</button>
    </div>
  ),
}));

const workspace = {
  created_at: "2026-01-01T00:00:00.000Z",
  id: "workspace_1",
  name: "Atlas",
  organization_id: "org_1",
  slug: "atlas",
  updated_at: "2026-01-01T00:00:00.000Z",
  visibility: "shared",
};

describe("WorkspacesList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useSyncAccessMock.mockReturnValue("cloud");
    useWorkspaceSyncMock.mockReturnValue({
      hasSynced: true,
    });
    useWorkspacesQueryMock.mockReturnValue({
      data: [],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function showDelayedLoading() {
    act(() => vi.advanceTimersByTime(LOADING_DELAY_MS));
  }

  it("shows skeleton while organization is unresolved", () => {
    render(
      <WorkspacesList organizationId={undefined} organizationSlug="acme" />
    );

    expect(screen.queryByTestId("workspaces-list-skeleton")).toBeNull();
    showDelayedLoading();
    expect(screen.getByTestId("workspaces-list-skeleton")).toBeTruthy();
  });

  it("shows skeleton while query is loading", () => {
    useWorkspacesQueryMock.mockReturnValue({
      data: [],
      error: undefined,
      isFetching: false,
      isLoading: true,
    });

    render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);

    expect(screen.queryByTestId("workspaces-list-skeleton")).toBeNull();
    showDelayedLoading();
    expect(screen.getByTestId("workspaces-list-skeleton")).toBeTruthy();
  });

  it("shows skeleton while an empty query is fetching", () => {
    useWorkspacesQueryMock.mockReturnValue({
      data: [],
      error: undefined,
      isFetching: true,
      isLoading: false,
    });

    render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);

    expect(screen.queryByTestId("workspaces-list-skeleton")).toBeNull();
    showDelayedLoading();
    expect(screen.getByTestId("workspaces-list-skeleton")).toBeTruthy();
  });

  it("never shows skeleton when loading finishes before delay", () => {
    useWorkspacesQueryMock.mockReturnValue({
      data: [],
      error: undefined,
      isFetching: false,
      isLoading: true,
    });

    const { rerender } = render(
      <WorkspacesList organizationId="org_1" organizationSlug="acme" />
    );

    act(() => vi.advanceTimersByTime(LOADING_DELAY_MS - 1));
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });
    rerender(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);
    act(() => vi.advanceTimersByTime(1));

    expect(screen.queryByTestId("workspaces-list-skeleton")).toBeNull();
    expect(screen.getByTestId("workspaces-list-item-atlas")).toBeTruthy();
  });

  it("shows empty state after an empty query settles", () => {
    const mark = vi.spyOn(globalThis.performance, "mark");
    render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);

    expect(screen.getByTestId("workspaces-list-empty").textContent).toContain(
      "No workspaces yet"
    );
    expect(
      screen.getByTestId("workspaces-list-empty").getAttribute("role")
    ).toBe(null);
    expect(screen.getByRole("status").textContent).toBe("No workspaces yet");
    expect(mark).toHaveBeenCalledWith("lunaris:workspaces-interactive");
    mark.mockRestore();
  });

  it("keeps existing cards visible during a background fetch", () => {
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: true,
      isLoading: false,
    });

    render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);

    expect(screen.getByTestId("workspaces-list")).toBeTruthy();
    expect(
      screen.getByTestId("workspaces-list-item-atlas").textContent
    ).toContain("Atlas");
    expect(screen.queryByTestId("workspaces-list-skeleton")).toBeNull();
  });

  it("filters workspaces by name or slug", () => {
    const secondWorkspace = {
      ...workspace,
      id: "workspace_2",
      name: "Beacon",
      slug: "north-star",
    };
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace, secondWorkspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    const { rerender } = render(
      <WorkspacesList
        organizationId="org_1"
        searchQuery="BEAC"
        organizationSlug="acme"
      />
    );

    expect(screen.queryByTestId("workspaces-list-item-atlas")).toBeNull();
    expect(screen.getByTestId("workspaces-list-item-north-star")).toBeTruthy();

    rerender(
      <WorkspacesList
        organizationId="org_1"
        searchQuery="north"
        organizationSlug="acme"
      />
    );
    expect(screen.getByTestId("workspaces-list-item-north-star")).toBeTruthy();
  });

  it("shows a dedicated empty state when search has no matches", () => {
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    render(
      <WorkspacesList
        organizationId="org_1"
        searchQuery="missing"
        organizationSlug="acme"
      />
    );

    expect(
      screen.getByTestId("workspaces-list-no-results").textContent
    ).toContain("No matching workspaces");
  });

  it("sorts workspaces by name or recent activity", () => {
    const secondWorkspace = {
      ...workspace,
      id: "workspace_2",
      name: "Beacon",
      slug: "beacon",
      updated_at: "2025-03-01T00:00:00.000Z",
      last_activity_at: "2026-03-01T00:00:00.000Z",
    };
    useWorkspacesQueryMock.mockReturnValue({
      data: [secondWorkspace, workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    const { rerender } = render(
      <WorkspacesList
        organizationId="org_1"
        sortBy="name"
        organizationSlug="acme"
      />
    );
    expect(
      screen.getAllByTestId(/^workspaces-list-item-/)[0]?.textContent
    ).toBe("Atlas");

    rerender(
      <WorkspacesList
        organizationId="org_1"
        sortBy="activity"
        organizationSlug="acme"
      />
    );
    expect(
      screen.getAllByTestId(/^workspaces-list-item-/)[0]?.textContent
    ).toBe("Beacon");
  });

  it("renders list view when selected", () => {
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    render(
      <WorkspacesList
        organizationId="org_1"
        view="list"
        organizationSlug="acme"
      />
    );

    expect(screen.getByTestId("workspaces-list").dataset.view).toBe("list");
    expect(screen.getByTestId("workspaces-list-item-atlas").dataset.view).toBe(
      "list"
    );
    expect(
      screen.getByRole("list", { name: "Recent Workspaces" })
    ).toBeTruthy();
  });

  it("does not sync workspace content on hover", () => {
    const onWorkspaceIntent = vi.fn();
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    render(
      <WorkspacesList
        onWorkspaceIntent={onWorkspaceIntent}
        organizationId="org_1"
        organizationSlug="acme"
      />
    );
    fireEvent.pointerEnter(screen.getByTestId("workspaces-list-item-atlas"));

    expect(onWorkspaceIntent).not.toHaveBeenCalled();
    expect(useWorkspaceSyncMock).not.toHaveBeenCalled();
  });

  it.each(["focus", "pointerDown"] as const)(
    "starts workspace content sync on %s",
    async (eventName) => {
      useWorkspacesQueryMock.mockReturnValue({
        data: [workspace],
        error: undefined,
        isFetching: false,
        isLoading: false,
      });

      render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);
      const item = screen.getByTestId("workspaces-list-item-atlas");
      await act(async () => {
        fireEvent[eventName](item);
        await vi.dynamicImportSettled();
      });

      expect(useWorkspaceSyncMock).toHaveBeenLastCalledWith(
        "workspace_1",
        "shared"
      );
    }
  );

  it("switches workspace content sync when activation moves", async () => {
    const secondWorkspace = {
      ...workspace,
      id: "workspace_2",
      name: "Beacon",
      slug: "beacon",
    };
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace, secondWorkspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);
    await act(async () => {
      fireEvent.focus(screen.getByTestId("workspaces-list-item-atlas"));
      fireEvent.focus(screen.getByTestId("workspaces-list-item-beacon"));
      await vi.dynamicImportSettled();
    });

    expect(useWorkspaceSyncMock).toHaveBeenLastCalledWith(
      "workspace_2",
      "shared"
    );
  });

  it("does not subscribe to cloud content in local-only mode", async () => {
    useSyncAccessMock.mockReturnValue("local-only");
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    const onWorkspaceIntent = vi.fn();
    render(
      <WorkspacesList
        onWorkspaceIntent={onWorkspaceIntent}
        organizationId="org_1"
        organizationSlug="acme"
      />
    );
    await act(async () => {
      fireEvent.focus(screen.getByTestId("workspaces-list-item-atlas"));
      await vi.dynamicImportSettled();
    });

    expect(useWorkspaceSyncMock).toHaveBeenLastCalledWith(undefined, "shared");
    expect(onWorkspaceIntent).toHaveBeenCalledWith(workspace);
  });

  it("preloads local workspace plugins without cloud readiness", async () => {
    const onWorkspaceIntent = vi.fn();
    const localWorkspace = { ...workspace, visibility: "local" };
    useWorkspacesQueryMock.mockReturnValue({
      data: [localWorkspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    render(
      <WorkspacesList
        onWorkspaceIntent={onWorkspaceIntent}
        organizationId="org_1"
        organizationSlug="acme"
      />
    );
    await act(async () => {
      fireEvent.focus(screen.getByTestId("workspaces-list-item-atlas"));
      await vi.dynamicImportSettled();
    });

    expect(useWorkspaceSyncMock).toHaveBeenLastCalledWith(
      "workspace_1",
      "local"
    );
    expect(onWorkspaceIntent).toHaveBeenCalledWith(localWorkspace);
  });

  it("loads plugin chunks while workspace content syncs", async () => {
    const onWorkspaceIntent = vi.fn();
    useWorkspaceSyncMock.mockReturnValue({
      hasSynced: false,
    });
    useWorkspacesQueryMock.mockReturnValue({
      data: [workspace],
      error: undefined,
      isFetching: false,
      isLoading: false,
    });

    render(
      <WorkspacesList
        onWorkspaceIntent={onWorkspaceIntent}
        organizationId="org_1"
        organizationSlug="acme"
      />
    );
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId("workspaces-list-item-atlas"));
      await vi.dynamicImportSettled();
    });

    expect(onWorkspaceIntent).toHaveBeenCalledWith(workspace);
    expect(useWorkspaceSyncMock).toHaveBeenLastCalledWith(
      "workspace_1",
      "shared"
    );
  });

  it("throws query errors", () => {
    const error = new Error("query failed");
    const mark = vi.spyOn(globalThis.performance, "mark");
    useWorkspacesQueryMock.mockReturnValue({
      data: [],
      error,
      isFetching: false,
      isLoading: false,
    });

    expect(() =>
      render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />)
    ).toThrow(error);
    expect(mark).toHaveBeenCalledWith("lunaris:workspaces-interactive");
    mark.mockRestore();
  });

  it("passes workspace stream wait options in cloud mode", () => {
    render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);

    expect(useWorkspacesQueryMock).toHaveBeenCalledWith({
      options: {
        streams: [{ name: "workspace_index", waitForStream: true }],
      },
      organizationId: "org_1",
    });
  });

  it("does not pass stream wait options in local-only mode", () => {
    useSyncAccessMock.mockReturnValue("local-only");

    render(<WorkspacesList organizationId="org_1" organizationSlug="acme" />);

    expect(useWorkspacesQueryMock).toHaveBeenCalledWith({
      options: undefined,
      organizationId: "org_1",
    });
  });
});
