vi.mock("../activity/services", () => ({
  recordActivity: vi.fn().mockResolvedValue(undefined),
}));
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWorkspaceVisibility } from "../workspaces/services";
import {
  RESOURCE_TRASH_RETENTION_MS,
  getExpiredLocalTrashRootIds,
  restoreWorkspaceResourceSubtrees,
  trashWorkspaceResourceSubtrees,
} from "./trash-services";

vi.mock("@powersync/react", () => ({
  useQuery: vi.fn(() => ({ data: [] })),
  useSuspenseQuery: vi.fn(() => ({ data: [] })),
}));

vi.mock("../workspaces/services", () => ({
  resolveWorkspaceVisibility: vi.fn(),
}));

const resolveWorkspaceVisibilityMock = vi.mocked(resolveWorkspaceVisibility);

describe("workspace resource trash lifecycle", () => {
  beforeEach(() => {
    resolveWorkspaceVisibilityMock.mockReset();
    resolveWorkspaceVisibilityMock.mockResolvedValue(
      WORKSPACE_VISIBILITY.shared
    );
  });
  it("marks every subtree row with one root and a 30-day deadline", async () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rowsAffected: 0 })
        .mockResolvedValueOnce({ rowsAffected: 1 })
        .mockResolvedValueOnce({ rowsAffected: 0 })
        .mockResolvedValueOnce({ rowsAffected: 1 }),
      getAll: vi
        .fn()
        .mockResolvedValue([{ id: "folder_1" }, { id: "document_1" }]),
    };

    await expect(
      trashWorkspaceResourceSubtrees({
        db: db as never,
        now,
        workspaceId: "workspace_1",
        rootIds: ["folder_1"],
      })
    ).resolves.toEqual(["folder_1", "document_1"]);

    const purgeAt = new Date(
      now.getTime() + RESOURCE_TRASH_RETENTION_MS
    ).toISOString();
    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("UPDATE workspace_resource_trash"),
      ["workspace_1", "folder_1", now.toISOString(), purgeAt, "folder_1"]
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO workspace_resource_trash"),
      ["folder_1", "workspace_1", "folder_1", now.toISOString(), purgeAt]
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("INSERT INTO workspace_resource_trash"),
      ["document_1", "workspace_1", "folder_1", now.toISOString(), purgeAt]
    );
  });

  it("restores a root at workspace level when its parent remains trashed", async () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rowsAffected: 1 })
        .mockResolvedValueOnce({ rowsAffected: 2 }),
      getOptional: vi
        .fn()
        .mockResolvedValueOnce({
          id: "document_1",
          workspace_id: "workspace_1",
          purge_at: "2026-10-04T10:00:00.000Z",
          trash_root_id: "document_1",
          trashed_at: "2026-09-04T10:00:00.000Z",
        })
        .mockResolvedValueOnce({ parent_id: "folder_1" })
        .mockResolvedValueOnce({ id: "folder_1" })
        .mockResolvedValueOnce({ trash_root_id: "folder_1" })
        .mockResolvedValueOnce({ next_position: 4 }),
    };

    await expect(
      restoreWorkspaceResourceSubtrees({
        db: db as never,
        now,
        workspaceId: "workspace_1",
        rootIds: ["document_1"],
      })
    ).resolves.toBe(2);
    expect(db.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SET parent_id = NULL"),
      [4, now.toISOString(), "document_1"]
    );
    expect(db.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("DELETE FROM workspace_resource_trash"),
      ["workspace_1", "document_1"]
    );
  });

  it("returns only expired trash roots", async () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    const db = {
      getAll: vi.fn().mockResolvedValue([{ id: "folder_1" }]),
    };

    resolveWorkspaceVisibilityMock.mockResolvedValueOnce(
      WORKSPACE_VISIBILITY.local
    );
    await expect(
      getExpiredLocalTrashRootIds({
        db: db as never,
        now,
        workspaceId: "workspace_1",
      })
    ).resolves.toEqual(["folder_1"]);
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining("trash_root_id = id AND purge_at <= ?"),
      ["workspace_1", now.toISOString()]
    );
  });

  it("leaves synced trash for the server purge worker", async () => {
    const db = { getAll: vi.fn() };

    await expect(
      getExpiredLocalTrashRootIds({
        db: db as never,
        workspaceId: "workspace_1",
      })
    ).resolves.toEqual([]);
    expect(db.getAll).not.toHaveBeenCalled();
  });
});
