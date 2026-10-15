vi.mock("../activity/services", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { resolveWorkspaceVisibilityMock, useQueryMock } = vi.hoisted(() => ({
  resolveWorkspaceVisibilityMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("@powersync/react", () => ({ useQuery: useQueryMock }));

vi.mock("../workspaces/services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspaces/services")>()),
  resolveWorkspaceVisibility: resolveWorkspaceVisibilityMock,
}));

import {
  createStorageValueService,
  deleteResourceStorage,
  ensureWorkspaceStorageSlot,
  getResourceStorageSlots,
  getStorageSlot,
  getStorageValue,
  getStorageValues,
  hasStorageBackingReference,
  setFileStorageMetadata,
  useWorkspaceStorageSlot,
  useWorkspaceStorageSlots,
  useResourceStorageSlots,
  useStorageSlot,
  useStorageValue,
  useStorageValueActions,
  useStorageValues,
} from "./services";

describe("createStorageValueService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveWorkspaceVisibilityMock.mockResolvedValue("shared");
  });

  it("does not write or advance activity for an unchanged value", async () => {
    const db = {
      execute: vi.fn(),
      getOptional: vi.fn()
        .mockResolvedValueOnce({ id: "storage_1", kind: "key-value", workspace_id: "workspace_1" })
        .mockResolvedValueOnce({ id: "value_1", value: '"dark"' }),
    };
    await createStorageValueService(db as never, "workspace_1", "storage_1").set("theme", "dark");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects a cross-workspace storage handle", async () => {
    const db = {
      execute: vi.fn(),
      getOptional: vi.fn().mockResolvedValue({
        id: "storage_1",
        kind: "key-value",
        workspace_id: "workspace_2",
      }),
    };

    await expect(
      createStorageValueService(db as never, "workspace_1", "storage_1").set(
        "theme",
        "dark",
      ),
    ).rejects.toThrow("Invalid key-value storage handle");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("writes only through a same-workspace key-value slot", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi
        .fn()
        .mockResolvedValueOnce({
          id: "storage_1",
          kind: "key-value",
          workspace_id: "workspace_1",
        })
        .mockResolvedValueOnce(null),
    };

    await createStorageValueService(
      db as never,
      "workspace_1",
      "storage_1",
    ).set("theme", "dark");

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO workspace_storage_values"),
      expect.arrayContaining(["storage_1", "workspace_1", "theme", '"dark"']),
    );
  });

  it("updates an existing value instead of inserting a duplicate", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi
        .fn()
        .mockResolvedValueOnce({
          id: "storage_1",
          kind: "key-value",
          workspace_id: "workspace_1",
        })
        .mockResolvedValueOnce({ id: "value_1" }),
    };

    await createStorageValueService(
      db as never,
      "workspace_1",
      "storage_1",
    ).set("theme", { mode: "dark" });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workspace_storage_values"),
      [JSON.stringify({ mode: "dark" }), expect.any(String), "value_1"],
    );
  });

  it("removes values from local and shared tables", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({
        id: "storage_1",
        kind: "key-value",
        workspace_id: "workspace_1",
      }),
    };

    await createStorageValueService(
      db as never,
      "workspace_1",
      "storage_1",
    ).remove("theme");

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls.map(([sql]) => String(sql))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DELETE FROM workspace_storage_values"),
        expect.stringContaining("DELETE FROM local_workspace_storage_values"),
      ]),
    );
  });
});

describe("workspace storage slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveWorkspaceVisibilityMock.mockResolvedValue("shared");
  });

  it("returns an existing workspace slot without writing", async () => {
    const existing = { id: "storage_existing", kind: "key-value" };
    const db = {
      execute: vi.fn(),
      getOptional: vi.fn().mockResolvedValue(existing),
    };

    await expect(
      ensureWorkspaceStorageSlot({
        db: db as never,
        name: "preferences",
        pluginId: "acme.notes",
        workspaceId: "workspace_1",
      }),
    ).resolves.toBe(existing);
    expect(db.execute).not.toHaveBeenCalled();
    expect(resolveWorkspaceVisibilityMock).not.toHaveBeenCalled();
  });

  it("creates missing local workspace slots in local storage", async () => {
    resolveWorkspaceVisibilityMock.mockResolvedValue("local");
    const created = { id: "created", kind: "key-value" };
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created),
    };

    await expect(
      ensureWorkspaceStorageSlot({
        db: db as never,
        name: "preferences",
        pluginId: "acme.notes",
        workspaceId: "workspace_1",
      }),
    ).resolves.toBe(created);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR IGNORE INTO local_workspace_storage_slots"),
      expect.arrayContaining(["workspace_1", "acme.notes", "preferences"]),
    );
  });

  it("reports backing references and deletes resource storage from both scopes", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([{ id: "storage_1" }, { id: "storage_2" }]),
      getOptional: vi.fn().mockResolvedValue({ id: "storage_1" }),
    };

    await expect(
      hasStorageBackingReference(db as never, "file", "file_1"),
    ).resolves.toBe(true);
    await expect(
      deleteResourceStorage(db as never, "resource_1"),
    ).resolves.toEqual([{ id: "storage_1" }, { id: "storage_2" }]);

    expect(db.execute).toHaveBeenCalledTimes(6);
    expect(db.execute.mock.calls.map(([sql]) => String(sql))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DELETE FROM workspace_storage_slots"),
        expect.stringContaining("DELETE FROM local_workspace_storage_slots"),
      ]),
    );
  });

  it.each([
    null,
    { kind: "file", workspace_id: "another_workspace" },
    { kind: "yjs", workspace_id: "workspace_1" },
    { kind: "file", workspace_id: "workspace_1", backing_id: "file_1", metadata: '{"mediaType":"text/plain"}' },
  ])("does not record activity for an invalid or unchanged file handle", async (slot) => {
    const db = { execute: vi.fn(), getOptional: vi.fn().mockResolvedValue(slot) };
    await setFileStorageMetadata({ db: db as never, backingId: "file_1", storageId: "storage_1", workspaceId: "workspace_1", metadata: { mediaType: "text/plain" } });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("updates file metadata only in the workspace visibility table", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({ id: "storage_1", kind: "file", workspace_id: "workspace_1" }),
    };

    await setFileStorageMetadata({
      backingId: "file_1",
      db: db as never,
      metadata: { mediaType: "text/plain" },
      workspaceId: "workspace_1",
      storageId: "storage_1",
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workspace_storage_slots"),
      [
        "file_1",
        JSON.stringify({ mediaType: "text/plain" }),
        expect.any(String),
        "storage_1",
        "workspace_1",
      ],
    );
  });

  it("builds scoped slot and value queries", async () => {
    const db = {
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue(null),
    };

    await getStorageSlot(db as never, "storage_1");
    await getResourceStorageSlots(db as never, "resource_1");
    await getStorageValue(db as never, "storage_1", "theme");
    await getStorageValues(db as never, "storage_1");

    expect(db.getOptional).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = ? LIMIT 1"),
      ["storage_1"],
    );
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining("WHERE resource_id = ? ORDER BY name ASC"),
      ["resource_1"],
    );
    expect(db.getOptional).toHaveBeenCalledWith(
      expect.stringContaining("WHERE storage_id = ? AND key = ? LIMIT 1"),
      ["storage_1", "theme"],
    );
  });

  it("wires query hooks with stable SQL parameters", () => {
    useQueryMock.mockReturnValue({ data: [] });

    renderHook(() => useResourceStorageSlots("resource_1"));
    renderHook(() => useWorkspaceStorageSlots("workspace_1"));
    renderHook(() => useStorageSlot("storage_1"));
    renderHook(() =>
      useWorkspaceStorageSlot({
        name: "preferences",
        pluginId: "acme.notes",
        workspaceId: "workspace_1",
      }),
    );
    renderHook(() => useStorageValues("storage_1"));

    expect(useQueryMock).toHaveBeenCalledTimes(5);
    expect(useQueryMock.mock.calls.map(([, params]) => params)).toEqual([
      ["resource_1"],
      ["workspace_1"],
      ["storage_1"],
      ["workspace_1", "acme.notes", "preferences"],
      ["storage_1"],
    ]);
  });

  it("decodes JSON values and preserves missing values", () => {
    useQueryMock.mockReturnValueOnce({ data: [{ value: '{"mode":"dark"}' }] });
    const parsed = renderHook(() => useStorageValue("storage_1", "theme"));
    expect(parsed.result.current.value).toEqual({ mode: "dark" });

    useQueryMock.mockReturnValueOnce({ data: [{ value: '"plain text"' }] });
    const text = renderHook(() => useStorageValue("storage_1", "theme"));
    expect(text.result.current.value).toBe("plain text");

    useQueryMock.mockReturnValueOnce({ data: [] });
    const missing = renderHook(() => useStorageValue("storage_1", "theme"));
    expect(missing.result.current.value).toBeNull();
  });

  it("rejects unencoded storage values", () => {
    useQueryMock.mockReturnValue({ data: [{ value: "unquoted" }] });
    try {
      expect(() => renderHook(() => useStorageValue("storage_1", "theme"))).toThrow(SyntaxError);
    } finally {
      useQueryMock.mockReset();
    }
  });

  it("exposes memoized storage value actions", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      getOptional: vi.fn().mockResolvedValue({
        id: "storage_1",
        kind: "key-value",
        workspace_id: "workspace_1",
      }),
    };
    const hook = renderHook(() =>
      useStorageValueActions(db as never, "workspace_1", "storage_1"),
    );

    await hook.result.current.remove("theme");
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});
