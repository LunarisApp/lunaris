import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspace,
  createWorkspacesService,
  getAllWorkspaces,
  getWorkspace,
  migrateLocalWorkspaceToShared,
  removeWorkspace,
  renameWorkspace,
  resolveWorkspaceVisibility,
  useWorkspaceBySlugQuery,
  useWorkspaceBySlugSuspenseQuery,
  useWorkspaceSlugCollision,
  useWorkspacesQuery,
  useWorkspacesSuspenseQuery,
} from "./services";

const { useQueryMock, useSuspenseQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(() => ({ data: [] })),
  useSuspenseQueryMock: vi.fn(() => ({ data: [] })),
}));

vi.mock("@powersync/react", () => ({
  useQuery: useQueryMock,
  useSuspenseQuery: useSuspenseQueryMock,
}));

describe("workspace services", () => {
  beforeEach(() => {
    useQueryMock.mockReset().mockReturnValue({ data: [] });
    useSuspenseQueryMock.mockReset().mockReturnValue({ data: [] });
  });

  it("builds filtered and unfiltered workspace queries", () => {
    const options = { runQueryOnce: true };

    useWorkspacesQuery({ id: "workspace_1", organizationId: "org_1", options });
    expect(useQueryMock).toHaveBeenLastCalledWith(
      expect.stringContaining("id = ? AND organization_id = ?"),
      ["workspace_1", "org_1"],
      options
    );

    useWorkspacesQuery();
    expect(useQueryMock).toHaveBeenLastCalledWith(
      expect.stringContaining(
        "WHERE 1 = 1 ORDER BY MAX(COALESCE(julianday(last_activity_at), 0), COALESCE(julianday(updated_at), 0)) DESC, id ASC"
      ),
      undefined,
      undefined
    );

    useWorkspacesSuspenseQuery({ organizationId: "org_1" });
    expect(useSuspenseQueryMock).toHaveBeenLastCalledWith(
      expect.stringContaining("organization_id = ?"),
      ["org_1"],
      undefined
    );
  });

  it("guards slug queries until both identifiers are present", () => {
    useWorkspaceBySlugQuery("atlas", "org_1");
    expect(useQueryMock).toHaveBeenLastCalledWith(
      expect.stringContaining("slug = ? AND organization_id = ?"),
      ["atlas", "org_1"],
      undefined
    );

    useWorkspaceBySlugSuspenseQuery("atlas");
    expect(useSuspenseQueryMock).toHaveBeenLastCalledWith(
      expect.stringContaining("WHERE 0"),
      undefined,
      undefined
    );
  });

  it("detects slug collisions while excluding the current workspace", () => {
    useQueryMock.mockReturnValue({
      data: [{ id: "workspace_1" }, { id: "workspace_2" }],
    } as never);

    expect(
      useWorkspaceSlugCollision({
        excludeWorkspaceId: "workspace_1",
        organizationId: "org_1",
        slug: " atlas ",
      }).hasCollision
    ).toBe(true);

    useQueryMock.mockReturnValue({ data: undefined } as never);
    expect(useWorkspaceSlugCollision({}).hasCollision).toBe(false);
  });

  it("persists the provided slug when renaming a workspace", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await renameWorkspace({
      db: db as never,
      id: "workspace_1",
      name: "Renamed Workspace",
      slug: "custom-workspace-slug",
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET name = ?, slug = ?, updated_at = ?"),
      [
        "Renamed Workspace",
        "custom-workspace-slug",
        expect.any(String),
        "workspace_1",
      ]
    );
  });

  it("creates local-only workspaces in the mirrored local table", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await createWorkspace({
      db: db as never,
      name: "Private Workspace",
      organizationId: "org_1",
      slug: "private-workspace",
      visibility: "local",
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO local_workspaces"),
      [
        expect.any(String),
        "Private Workspace",
        "private-workspace",
        "org_1",
        "local",
        expect.any(String),
        expect.any(String),
      ]
    );
  });

  it("derives a strict lowercase slug when none is supplied", async () => {
    const db = { execute: vi.fn().mockResolvedValue(undefined) };

    await createWorkspace({
      db: db as never,
      name: "Road Map 2026!",
      organizationId: "org_1",
      visibility: "shared",
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO workspaces"),
      expect.arrayContaining(["Road Map 2026!", "road-map-2026", "shared"])
    );
  });

  it("removes workspaces from local and shared tables", async () => {
    const sharedResult = { rowsAffected: 1 };
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(sharedResult)
        .mockResolvedValueOnce(undefined),
    };

    await expect(
      removeWorkspace({ db: db as never, id: "workspace_1" })
    ).resolves.toBe(sharedResult);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("defaults missing workspace visibility to shared", async () => {
    const db = { getOptional: vi.fn().mockResolvedValue(undefined) };

    await expect(
      resolveWorkspaceVisibility(db as never, "workspace_missing")
    ).resolves.toBe("shared");
  });

  it("reads individual and ordered workspace collections", async () => {
    const workspace = { id: "workspace_1", visibility: "local" };
    const db = {
      getAll: vi.fn().mockResolvedValue([workspace]),
      getOptional: vi.fn().mockResolvedValue(workspace),
    };

    await expect(
      getWorkspace({ db: db as never, id: "workspace_1" })
    ).resolves.toBe(workspace);
    await expect(getAllWorkspaces({ db: db as never })).resolves.toEqual([
      workspace,
    ]);
    await expect(
      resolveWorkspaceVisibility(db as never, "workspace_1")
    ).resolves.toBe("local");
    expect(db.getOptional).toHaveBeenCalledWith(
      expect.stringContaining("id = ?"),
      ["workspace_1"]
    );
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining(
        "MAX(COALESCE(julianday(last_activity_at), 0), COALESCE(julianday(updated_at), 0)) DESC, created_at DESC, id ASC"
      )
    );
  });

  it("skips migration when the local workspace is missing", async () => {
    const db = {
      getOptional: vi.fn().mockResolvedValue(undefined),
      writeTransaction: vi.fn(),
    };

    await expect(
      migrateLocalWorkspaceToShared({ db: db as never, id: "missing" })
    ).resolves.toBe(false);
    expect(db.writeTransaction).not.toHaveBeenCalled();
  });

  it("promotes marketplace release provenance with local workspaces", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = { execute };
    const db = {
      getOptional: vi.fn().mockResolvedValue({ id: "workspace_1" }),
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx)
      ),
    };

    await migrateLocalWorkspaceToShared({ db: db as never, id: "workspace_1" });

    const extensionCopy = execute.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO workspace_extensions")
    );
    expect(extensionCopy?.[0]).toContain("registry_id, version");
    expect(extensionCopy?.[0]).toContain(
      "descriptor_url, descriptor_bytes, descriptor_sha256"
    );
    expect(execute).toHaveBeenCalledTimes(14);
    expect(execute.mock.calls.at(-1)?.[0]).toContain(
      "DELETE FROM local_workspaces"
    );
  });

  it("binds every service method to its database", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue(undefined),
      writeTransaction: vi.fn(),
    };
    const service = createWorkspacesService(db as never);

    await service.create({
      name: "Atlas",
      organizationId: "org_1",
      visibility: "shared",
    });
    await service.get({ id: "workspace_1" });
    await service.getAll();
    await service.remove({ id: "workspace_1" });
    await service.rename({
      id: "workspace_1",
      name: "Atlas 2",
      slug: "atlas-2",
    });
    await expect(service.migrateToShared({ id: "missing" })).resolves.toBe(
      false
    );

    expect(db.execute).toHaveBeenCalled();
    expect(db.getOptional).toHaveBeenCalled();
    expect(db.getAll).toHaveBeenCalled();
  });
});
