import type { ResourceTypeDefinition } from "@lunarisapp/plugin-sdk";
import { Doc } from "yjs";
import * as z from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  compareAndSetWorkspaceResourceVersion,
  disposeHydration,
  disposeStagedHydration,
  getWorkspaceResource,
  hydrateResourceStorage,
  insertYjsDocumentUpdate,
  resolveWorkspaceScopedTables,
  resolveWorkspaceVisibility,
  uint8ArrayToB64,
} =
  vi.hoisted(() => ({
    compareAndSetWorkspaceResourceVersion: vi.fn(),
    disposeHydration: vi.fn(),
    disposeStagedHydration: vi.fn(),
    getWorkspaceResource: vi.fn(),
    hydrateResourceStorage: vi.fn(),
    insertYjsDocumentUpdate: vi.fn(),
    resolveWorkspaceScopedTables: vi.fn(),
    resolveWorkspaceVisibility: vi.fn(),
    uint8ArrayToB64: vi.fn(),
  }));

vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  hydrateResourceStorage,
  resolveWorkspaceScopedTables,
}));

vi.mock("@repo/data/features/workspace-resources", () => ({
  compareAndSetWorkspaceResourceVersion,
  getWorkspaceResource,
}));

vi.mock("@repo/data/features/workspaces", () => ({
  resolveWorkspaceVisibility,
}));

vi.mock("@repo/data/features/yjs", () => ({
  insertYjsDocumentUpdate,
  PERSISTED_YJS_UPDATE_ORIGIN: Symbol("persisted"),
  Uint8ArrayTob64: uint8ArrayToB64,
}));

import { resolveHostResource } from "./resource-resolution";

describe("resolveHostResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceResource.mockResolvedValue({
      created_at: "2026-01-01T00:00:00.000Z",
    });
    hydrateResourceStorage.mockResolvedValue({
      dispose: disposeHydration,
      slots: [],
      storage: {},
    });
    compareAndSetWorkspaceResourceVersion.mockReset();
    insertYjsDocumentUpdate.mockResolvedValue(undefined);
    resolveWorkspaceVisibility.mockResolvedValue("shared");
    resolveWorkspaceScopedTables.mockReturnValue({
      workspaceStorageSlots: "workspace_storage_slots",
      workspaceStorageValues: "workspace_storage_values",
      yjsDocuments: "yjs_documents",
      yjsDocumentUpdates: "yjs_document_updates",
    });
    uint8ArrayToB64.mockReturnValue("encoded-update");
  });

  it("destroys temporary Yjs storage after resolution", async () => {
    const destroy = vi.spyOn(Doc.prototype, "destroy");
    const definition: ResourceTypeDefinition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 2,
        id: "acme.note.schema",
        read: () => ({ invalid: true }),
        versions: {
          1: z.object({ value: z.number() }),
          2: z.object({ value: z.number() }),
        },
      },
      storage: { content: { kind: "yjs" } },
    };

    const result = await resolveHostResource({
      db: { writeTransaction: vi.fn() } as never,
      definition,
      envelope: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "acme.note",
        schemaId: "acme.note.schema",
        schemaVersion: 1,
      },
      workspaceId: "workspace-1",
    });

    expect(result.status).toBe("quarantined");
    expect(destroy).toHaveBeenCalledOnce();
    expect(disposeHydration).toHaveBeenCalledOnce();
  });

  it("returns ready resources and always releases hydrated storage", async () => {
    const definition: ResourceTypeDefinition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 1,
        id: "acme.note.schema",
        read: () => ({ value: 1 }),
        versions: { 1: z.object({ value: z.number() }) },
      },
      storage: {},
    };

    const result = await resolveHostResource({
      db: {} as never,
      definition,
      envelope: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "acme.note",
        schemaId: "acme.note.schema",
        schemaVersion: 1,
      },
      workspaceId: "workspace-1",
    });

    expect(result).toMatchObject({ payload: { value: 1 }, status: "ready" });
    expect(disposeHydration).toHaveBeenCalledOnce();
  });

  it("quarantines hydration failures with safe diagnostics", async () => {
    hydrateResourceStorage.mockRejectedValue("offline");
    const definition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 1,
        id: "acme.note.schema",
        read: () => ({}),
        versions: { 1: z.object({}) },
      },
      storage: {},
    } satisfies ResourceTypeDefinition;

    await expect(
      resolveHostResource({
        db: {} as never,
        definition,
        envelope: {
          parentId: null,
          resourceId: "resource-1",
          resourceTypeId: "acme.note",
          schemaId: "acme.note.schema",
          schemaVersion: 1,
        },
        workspaceId: "workspace-1",
      }),
    ).resolves.toMatchObject({
      diagnostic: "Storage load failed",
      retryable: true,
      status: "quarantined",
    });
  });

  it("quarantines persisted slots whose kind changed", async () => {
    hydrateResourceStorage.mockResolvedValue({
      dispose: disposeHydration,
      slots: [{ kind: "file", name: "content" }],
      storage: { content: { kind: "file", metadata: null } },
    });
    const definition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 1,
        id: "acme.note.schema",
        read: () => ({}),
        versions: { 1: z.object({}) },
      },
      storage: { content: { kind: "key-value" } },
    } satisfies ResourceTypeDefinition;

    const result = await resolveHostResource({
      db: {} as never,
      definition,
      envelope: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "acme.note",
        schemaId: "acme.note.schema",
        schemaVersion: 1,
      },
      workspaceId: "workspace-1",
    });

    expect(result).toMatchObject({
      diagnostic: "Storage slot content changed kind",
      status: "quarantined",
    });
    expect(disposeHydration).toHaveBeenCalledOnce();
  });

  it("rejects missing current-version storage", async () => {
    const definition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 1,
        id: "acme.note.schema",
        read: () => ({}),
        versions: { 1: z.object({}) },
      },
      storage: { content: { kind: "file" } },
    } satisfies ResourceTypeDefinition;

    const result = await resolveHostResource({
      db: {} as never,
      definition,
      envelope: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "acme.note",
        schemaId: "acme.note.schema",
        schemaVersion: 1,
      },
      workspaceId: "workspace-1",
    });

    expect(result).toMatchObject({
      diagnostic: "Storage slot content is unavailable",
      status: "quarantined",
    });
  });

  it("destroys initialized Yjs documents when later initialization fails", async () => {
    const destroy = vi.spyOn(Doc.prototype, "destroy");
    const definition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 2,
        id: "acme.note.schema",
        migrations: [{ from: 1, migrate: () => ({}), to: 2 }],
        read: () => ({}),
        versions: { 1: z.object({}), 2: z.object({}) },
      },
      storage: {
        content: { kind: "yjs" },
        metadata: {
          initialize: () => {
            throw new Error("initializer failed");
          },
          kind: "key-value",
        },
      },
    } satisfies ResourceTypeDefinition;

    const result = await resolveHostResource({
      db: {} as never,
      definition,
      envelope: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "acme.note",
        schemaId: "acme.note.schema",
        schemaVersion: 1,
      },
      workspaceId: "workspace-1",
    });

    expect(result).toMatchObject({
      diagnostic: "initializer failed",
      status: "quarantined",
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("creates missing file, key-value, and Yjs storage during migration", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    hydrateResourceStorage
      .mockResolvedValueOnce({
        dispose: disposeHydration,
        slots: [],
        storage: {},
      })
      .mockResolvedValueOnce({
        dispose: disposeStagedHydration,
        slots: [],
        storage: {},
      });
    compareAndSetWorkspaceResourceVersion.mockImplementation(
      async ({ mutatePayload }: { mutatePayload: (tx: unknown) => Promise<void> }) => {
        await mutatePayload({ execute });
        return true;
      },
    );
    const definition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 2,
        id: "acme.note.schema",
        migrations: [{ from: 1, migrate: () => ({ value: 2 }), to: 2 }],
        read: () => ({ value: 1 }),
        versions: {
          1: z.object({ value: z.number() }),
          2: z.object({ value: z.number() }),
        },
        write: vi.fn(),
      },
      storage: {
        attachment: { kind: "file" },
        content: {
          initialize: (document: Doc) => {
            document.getText("content").insert(0, "hello");
          },
          kind: "yjs",
        },
        metadata: {
          initialize: () => ({ theme: "dark" }),
          kind: "key-value",
        },
      },
    } satisfies ResourceTypeDefinition;

    const result = await resolveHostResource({
      db: {} as never,
      definition,
      envelope: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "acme.note",
        schemaId: "acme.note.schema",
        schemaVersion: 1,
      },
      workspaceId: "workspace-1",
    });

    expect(result).toMatchObject({
      envelope: { schemaVersion: 2 },
      payload: { value: 2 },
      status: "ready",
    });
    const statements = execute.mock.calls.map(([sql]) => String(sql));
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining("INSERT INTO yjs_documents"),
        expect.stringContaining("INSERT INTO workspace_storage_slots"),
        expect.stringContaining("INSERT INTO workspace_storage_values"),
        expect.stringContaining("INSERT INTO yjs_document_updates"),
      ]),
    );
    expect(disposeHydration).toHaveBeenCalledOnce();
    expect(disposeStagedHydration).toHaveBeenCalledOnce();
  });

  it("persists existing key-value and Yjs storage changes", async () => {
    const before = new Doc();
    const staged = new Doc();
    const execute = vi.fn().mockResolvedValue(undefined);
    const slots = [
      { backing_id: "yjs-1", id: "storage-yjs", kind: "yjs", name: "content" },
      { backing_id: null, id: "storage-meta", kind: "key-value", name: "metadata" },
    ];
    hydrateResourceStorage
      .mockResolvedValueOnce({
        dispose: disposeHydration,
        slots,
        storage: {
          content: { document: before, kind: "yjs" },
          metadata: { kind: "key-value", values: { theme: "light" } },
        },
      })
      .mockResolvedValueOnce({
        dispose: disposeStagedHydration,
        slots,
        storage: {
          content: { document: staged, kind: "yjs" },
          metadata: { kind: "key-value", values: { theme: "light" } },
        },
      });
    compareAndSetWorkspaceResourceVersion.mockImplementation(
      async ({ mutatePayload }: { mutatePayload: (tx: unknown) => Promise<void> }) => {
        await mutatePayload({ execute });
        return true;
      },
    );
    const definition = {
      icon: [],
      name: "Note",
      resourceTypeId: "acme.note",
      schema: {
        currentVersion: 2,
        id: "acme.note.schema",
        migrations: [{ from: 1, migrate: () => ({ value: 2 }), to: 2 }],
        read: () => ({ value: 1 }),
        versions: {
          1: z.object({ value: z.number() }),
          2: z.object({ value: z.number() }),
        },
        write: vi.fn((_payload, context) => {
          const metadata = context.storage.metadata;
          const content = context.storage.content;
          if (metadata?.kind === "key-value") metadata.values.theme = "dark";
          if (content?.kind === "yjs") {
            content.document.getText("content").insert(0, "updated");
          }
        }),
      },
      storage: {
        content: { kind: "yjs" },
        metadata: { kind: "key-value" },
      },
    } satisfies ResourceTypeDefinition;

    const result = await resolveHostResource({
      db: {} as never,
      definition,
      envelope: {
        parentId: null,
        resourceId: "resource-1",
        resourceTypeId: "acme.note",
        schemaId: "acme.note.schema",
        schemaVersion: 1,
      },
      workspaceId: "workspace-1",
    });

    expect(result.status).toBe("ready");
    expect(execute.mock.calls.map(([sql]) => String(sql))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DELETE FROM workspace_storage_values"),
        expect.stringContaining("INSERT INTO workspace_storage_values"),
      ]),
    );
    expect(insertYjsDocumentUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "yjs-1",
      "workspace-1",
      "encoded-update",
      null,
    );
    before.destroy();
    staged.destroy();
  });
});
