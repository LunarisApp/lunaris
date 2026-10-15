/** @vitest-environment happy-dom */

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markDefaultWorkspaceSeedPending } from "./seed-marker";
import { useDefaultTemplateWorkspaceSeeder } from "./use-default-template-seeder";

const {
  reserveResourceCapacityMock,
  seedDefaultTemplateWorkspaceMock,
  useWorkspacesQueryMock,
  useSyncAccessMock,
} = vi.hoisted(() => ({
  reserveResourceCapacityMock: vi.fn(),
  seedDefaultTemplateWorkspaceMock: vi.fn(),
  useWorkspacesQueryMock: vi.fn(),
  useSyncAccessMock: vi.fn(),
}));

vi.mock("@repo/features/entitlements", () => ({
  useReserveResourceCapacity: () => reserveResourceCapacityMock,
}));

vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud", localOnly: "local-only" },
  usePowerSync: () => ({ id: "db" }),
  useSyncAccess: useSyncAccessMock,
}));

vi.mock("@repo/data/features/workspaces", () => ({
  WORKSPACE_INDEX_SYNC_STREAMS: [
    { name: "workspace_index", waitForStream: true },
  ],
  useWorkspacesQuery: useWorkspacesQueryMock,
}));

vi.mock("./seed-service", () => ({
  DEFAULT_TEMPLATE_ITEM_COUNT: 15,
  seedDefaultTemplateWorkspace: seedDefaultTemplateWorkspaceMock,
}));

vi.mock("evlog", () => ({
  log: { error: vi.fn() },
  parseError: (error: unknown) => error,
}));

function Seeder(props: {
  currentUserEmail?: string | null;
  organizationId?: string;
}) {
  useDefaultTemplateWorkspaceSeeder(props);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useSyncAccessMock.mockReturnValue("cloud");
  useWorkspacesQueryMock.mockReturnValue({
    data: [],
    isFetching: false,
    isLoading: false,
  });
  seedDefaultTemplateWorkspaceMock.mockResolvedValue("workspace_1");
  reserveResourceCapacityMock.mockResolvedValue({
    commit: vi.fn(),
    rollback: vi.fn(),
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("useDefaultTemplateWorkspaceSeeder", () => {
  it("skips when marker is absent", () => {
    render(<Seeder currentUserEmail="user@example.com" organizationId="org_1" />);

    expect(seedDefaultTemplateWorkspaceMock).not.toHaveBeenCalled();
  });

  it("clears marker when organization already has workspaces", () => {
    markDefaultWorkspaceSeedPending({ kind: "anonymous" });
    useWorkspacesQueryMock.mockReturnValue({
      data: [{ id: "workspace_existing" }],
      isFetching: false,
      isLoading: false,
    });

    render(<Seeder currentUserEmail={null} organizationId="org_1" />);

    expect(seedDefaultTemplateWorkspaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("lunaris_pending_default_workspace_seed")).toBeNull();
  });

  it("clears registered marker on email mismatch", () => {
    markDefaultWorkspaceSeedPending({
      kind: "registered",
      email: "first@example.com",
    });

    render(<Seeder currentUserEmail="second@example.com" organizationId="org_1" />);

    expect(seedDefaultTemplateWorkspaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("lunaris_pending_default_workspace_seed")).toBeNull();
  });

  it("waits for session email before resolving registered marker", () => {
    markDefaultWorkspaceSeedPending({
      kind: "registered",
      email: "user@example.com",
    });

    render(<Seeder currentUserEmail={undefined} organizationId="org_1" />);

    expect(seedDefaultTemplateWorkspaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("lunaris_pending_default_workspace_seed")).toBe(
      JSON.stringify({ kind: "registered", email: "user@example.com" })
    );
  });

  it("seeds once and clears marker for empty future users", async () => {
    markDefaultWorkspaceSeedPending({ kind: "anonymous" });

    render(<Seeder currentUserEmail={null} organizationId="org_1" />);

    await waitFor(() => {
      expect(seedDefaultTemplateWorkspaceMock).toHaveBeenCalledWith({
        db: { id: "db" },
        resourceCapacityReservation: expect.objectContaining({
          commit: expect.any(Function),
          rollback: expect.any(Function),
        }),
        organizationId: "org_1",
      });
    });
    await waitFor(() => {
      expect(localStorage.getItem("lunaris_pending_default_workspace_seed")).toBeNull();
    });
  });

  it("does not seed when template item slots are unavailable", async () => {
    markDefaultWorkspaceSeedPending({ kind: "anonymous" });
    reserveResourceCapacityMock.mockRejectedValue(new Error("limit reached"));

    render(<Seeder currentUserEmail={null} organizationId="org_1" />);

    await waitFor(() => expect(reserveResourceCapacityMock).toHaveBeenCalledWith(15));
    expect(seedDefaultTemplateWorkspaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("lunaris_pending_default_workspace_seed")).not.toBeNull();
  });

  it("waits while workspaces query is loading", () => {
    markDefaultWorkspaceSeedPending({ kind: "anonymous" });
    useWorkspacesQueryMock.mockReturnValue({
      data: [],
      isFetching: false,
      isLoading: true,
    });

    render(<Seeder currentUserEmail={null} organizationId="org_1" />);

    expect(seedDefaultTemplateWorkspaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("lunaris_pending_default_workspace_seed")).toBe(
      JSON.stringify({ kind: "anonymous" })
    );
  });

  it("waits while workspaces query is fetching", () => {
    markDefaultWorkspaceSeedPending({ kind: "anonymous" });
    useWorkspacesQueryMock.mockReturnValue({
      data: [],
      isFetching: true,
      isLoading: false,
    });

    render(<Seeder currentUserEmail={null} organizationId="org_1" />);

    expect(seedDefaultTemplateWorkspaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("lunaris_pending_default_workspace_seed")).toBe(
      JSON.stringify({ kind: "anonymous" })
    );
  });

  it("passes workspace stream wait options in cloud mode", () => {
    render(<Seeder currentUserEmail={null} organizationId="org_1" />);

    expect(useWorkspacesQueryMock).toHaveBeenCalledWith({
      options: {
        streams: [{ name: "workspace_index", waitForStream: true }],
      },
      organizationId: "org_1",
    });
  });

  it("does not pass stream wait options in local-only mode", () => {
    useSyncAccessMock.mockReturnValue("local-only");

    render(<Seeder currentUserEmail={null} organizationId="org_1" />);

    expect(useWorkspacesQueryMock).toHaveBeenCalledWith({
      options: undefined,
      organizationId: "org_1",
    });
  });
});
