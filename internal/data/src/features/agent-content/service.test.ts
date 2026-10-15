import { IndexedDbFileStorageAdapter } from "../../storage/indexeddb-file-storage";
import { getRichTextDocument } from "@extension/rich-text/mcp-runtime";
import { describe, expect, it, vi } from "vitest";
import {
  applyUpdateV2,
  Doc,
  encodeStateAsUpdateV2,
  Map as YMap,
} from "yjs";
import { b64ToUint8Array, Uint8ArrayTob64 } from "../yjs/utils";
import {
  createDeviceContentClient,
  createDeviceControlClient,
} from "./service";

const WORKSPACES = [
  {
    created_at: "2026-01-01T00:00:00.000Z",
    id: "local-workspace",
    name: "Local",
    organization_id: "organization",
    slug: "local",
    updated_at: "2026-01-03T00:00:00.000Z",
    visibility: "local",
  },
  {
    created_at: "2026-01-01T00:00:00.000Z",
    id: "shared-workspace",
    name: "Cached",
    organization_id: "organization",
    slug: "cached",
    updated_at: "2026-01-02T00:00:00.000Z",
    visibility: "shared",
  },
] as const;

const SEARCH_ITEMS = [
  {
    created_at: "2026-01-01T00:00:00.000Z",
    icon: null,
    id: "local-item",
    name: "Mixed Case Notes",
    parent_id: null,
    resource_type_id: "lunaris.rich-text",
    position: 0,
    workspace_id: "local-workspace",
    updated_at: "2026-01-03T00:00:00.000Z",
  },
  {
    created_at: "2026-01-01T00:00:00.000Z",
    icon: null,
    id: "shared-item",
    name: "Mixed Case Roadmap",
    parent_id: null,
    resource_type_id: "lunaris.rich-text",
    position: 0,
    workspace_id: "shared-workspace",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
] as const;

function createLocalDocumentHarness(item: {
  yjs_backing_id: string;
  updated_at: string;
}) {
  let updateB64: string | undefined;
  const db = {
    execute: vi.fn(async (query: string, params: unknown[]) => {
      if (query.includes("INSERT INTO local_yjs_document_updates")) {
        updateB64 = String(params[4]);
      }
    }),
    getAll: vi.fn(async () => []),
    getOptional: vi.fn(async (query: string) => {
      if (query.includes("agent_idempotency")) return null;
      if (query.includes("local_workspaces")) return WORKSPACES[0];
      if (query.includes("workspace_resources")) return item;
      if (query.includes("yjs_documents")) {
        return { id: item.yjs_backing_id, updated_at: item.updated_at };
      }
      return null;
    }),
  };
  const getUpdate = () => {
    if (!updateB64) throw new Error("Expected a persisted Yjs update");
    return b64ToUint8Array(updateB64);
  };
  return { db, getUpdate };
}

describe("createDeviceContentClient", () => {
  it("returns the unified local/cache view with visible freshness", async () => {
    const db = {
      getAll: vi.fn(async () => WORKSPACES),
    };
    const client = createDeviceContentClient(db as never, {
      readCoordinator: {
        dispose: vi.fn(),
        resolve: vi.fn(async () => ({
          completeness: "complete" as const,
          confirmedAt: "2026-01-04T00:00:00.000Z",
          syncState: "stale" as const,
        })),
      },
    });

    const result = await client.listWorkspaces("organization");

    expect(result.items.map((item) => item.visibility)).toEqual([
      "local",
      "shared",
    ]);
    expect(result.items[0]?.provenance).toEqual({
      asOf: "2026-01-03T00:00:00.000Z",
      source: "device-local",
      syncState: "current",
    });
    expect(result.items[1]?.provenance).toEqual({
      asOf: "2026-01-02T00:00:00.000Z",
      source: "cloud-cache",
      syncState: "stale",
    });
    expect(result.snapshot).toEqual({
      completeness: "complete",
      confirmedAt: "2026-01-04T00:00:00.000Z",
      syncState: "stale",
    });
  });

  it("waits for workspace catalog confirmation before querying SQLite", async () => {
    let confirm: (() => void) | undefined;
    const confirmed = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    const db = {
      getAll: vi.fn(async () => WORKSPACES),
    };
    const resolve = vi.fn(async () => {
      await confirmed;
      return {
        completeness: "complete" as const,
        confirmedAt: "2026-01-04T00:00:00.000Z",
        syncState: "current" as const,
      };
    });
    const client = createDeviceContentClient(db as never, {
      readCoordinator: { dispose: vi.fn(), resolve },
    });

    const pending = client.listWorkspaces("organization");
    expect(resolve).toHaveBeenCalledOnce();
    expect(db.getAll).not.toHaveBeenCalled();
    confirm?.();
    await pending;

    expect(db.getAll).toHaveBeenCalledOnce();
  });

  it("serves local-only workspaces without waiting for cloud sync", async () => {
    const resolve = vi.fn();
    const db = {
      getOptional: vi.fn(async () => WORKSPACES[0]),
    };
    const client = createDeviceContentClient(db as never, {
      activeOrganizationId: () => "other-organization",
      readCoordinator: { dispose: vi.fn(), resolve },
    });

    await expect(
      client.getWorkspace("organization", "local-workspace"),
    ).resolves.toMatchObject({
      id: "local-workspace",
      provenance: {
        source: "device-local",
        syncState: "current",
      },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("fails confirmed shared reads outside the active sync organization", async () => {
    const resolve = vi.fn();
    const db = {
      getAll: vi.fn(),
    };
    const client = createDeviceContentClient(db as never, {
      activeOrganizationId: () => "active-organization",
      readCoordinator: { dispose: vi.fn(), resolve },
    });

    await expect(
      client.listWorkspaces("other-organization"),
    ).rejects.toMatchObject({
      code: "INCOMPLETE_SYNC",
      status: 409,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(db.getAll).not.toHaveBeenCalled();
  });

  it("marks cached reads from a non-active organization as partial", async () => {
    const resolve = vi.fn();
    const db = {
      getAll: vi.fn(async () => [WORKSPACES[0]]),
    };
    const client = createDeviceContentClient(db as never, {
      activeOrganizationId: () => "active-organization",
      readCoordinator: { dispose: vi.fn(), resolve },
    });

    const result = await client.listWorkspaces(
      "other-organization",
      {},
      { consistency: "cached" },
    );

    expect(result.snapshot).toEqual({
      completeness: "partial",
      confirmedAt: null,
      syncState: "unknown",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not turn an incomplete cached miss into a false 404", async () => {
    const db = {
      getOptional: vi.fn(async () => null),
    };
    const client = createDeviceContentClient(db as never, {
      readCoordinator: {
        dispose: vi.fn(),
        resolve: vi.fn(async () => ({
          completeness: "partial" as const,
          confirmedAt: null,
          syncState: "unknown" as const,
        })),
      },
    });

    await expect(
      client.getWorkspace(
        "organization",
        "not-cached",
        { consistency: "cached" },
      ),
    ).rejects.toMatchObject({
      code: "INCOMPLETE_SYNC",
      status: 409,
    });
  });

  it("uses the organization item index without hydrating workspace content", async () => {
    const resolve = vi.fn(async () => ({
      completeness: "complete" as const,
      confirmedAt: "2026-01-04T00:00:00.000Z",
      syncState: "current" as const,
    }));
    const db = {
      getAll: vi.fn(async () => []),
      getOptional: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(WORKSPACES[1]),
    };
    const client = createDeviceContentClient(db as never, {
      readCoordinator: { dispose: vi.fn(), resolve },
    });

    await client.listWorkspaceResources("organization", "shared-workspace");

    expect(resolve).toHaveBeenNthCalledWith(
      1,
      { kind: "organization-resources" },
      undefined,
    );
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(db.getAll).toHaveBeenCalledOnce();
  });

  it("hydrates the organization item index before global search", async () => {
    const resolve = vi.fn(async () => ({
      completeness: "complete" as const,
      confirmedAt: "2026-01-04T00:00:00.000Z",
      syncState: "current" as const,
    }));
    const db = {
      getAll: vi.fn(async (_query: string, params: unknown[]) =>
        params.length ? WORKSPACES : [],
      ),
    };
    const client = createDeviceContentClient(db as never, {
      readCoordinator: { dispose: vi.fn(), resolve },
    });

    await client.searchResources("organization", { search: "cached" });

    expect(resolve).toHaveBeenNthCalledWith(
      1,
      { kind: "organization-resources" },
      undefined,
    );
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("matches lowercase item searches across organization workspaces", async () => {
    const db = {
      getAll: vi.fn(async (_query: string, params: unknown[]) =>
        params.length ? WORKSPACES : SEARCH_ITEMS,
      ),
    };
    const client = createDeviceContentClient(db as never, {
      readCoordinator: {
        dispose: vi.fn(),
        resolve: vi.fn(async () => ({
          completeness: "complete" as const,
          confirmedAt: "2026-01-04T00:00:00.000Z",
          syncState: "current" as const,
        })),
      },
    });

    const result = await client.searchResources("organization", {
      search: "mixed case",
    });

    expect(result.items.map((item) => item.name)).toEqual([
      "Mixed Case Notes",
      "Mixed Case Roadmap",
    ]);
  });

  it("limits item search when a workspace scope is supplied", async () => {
    const db = {
      getAll: vi.fn(async (_query: string, params: unknown[]) =>
        params.length ? WORKSPACES : SEARCH_ITEMS,
      ),
      getOptional: vi.fn(async (query: string) =>
        query.includes("local_workspaces") ? null : WORKSPACES[1],
      ),
    };
    const client = createDeviceContentClient(db as never, {
      readCoordinator: {
        dispose: vi.fn(),
        resolve: vi.fn(async () => ({
          completeness: "complete" as const,
          confirmedAt: "2026-01-04T00:00:00.000Z",
          syncState: "current" as const,
        })),
      },
    });

    const result = await client.searchResources("organization", {
      workspaceId: "shared-workspace",
      search: "mixed case",
    });

    expect(result.items.map((item) => item.name)).toEqual([
      "Mixed Case Roadmap",
    ]);
  });
});

describe("createDeviceControlClient", () => {
  it("reports oversized cached downloads without allocating their bytes", async () => {
    const arrayBuffer = vi.fn();
    const read = vi.spyOn(IndexedDbFileStorageAdapter.prototype, "readBlob")
      .mockResolvedValue({ size: 25_000_001, arrayBuffer } as unknown as Blob);
    const db = { getOptional: vi.fn(async (query: string) => {
      if (query.includes("workspace_storage_slots")) return {
        id: "slot", resource_id: "resource", workspace_id: "local-workspace", kind: "file", backing_id: "file", metadata: "{}",
      };
      if (query.includes("FROM attachments")) return { filename: "file.bin", local_uri: "cached", media_type: "application/octet-stream" };
      return WORKSPACES[0];
    }) };
    try {
      const client = createDeviceControlClient(db as never);
      await expect(client.getFileDownloadUrl("organization", "local-workspace", "slot"))
        .rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE", status: 413 });
      expect(arrayBuffer).not.toHaveBeenCalled();
    } finally { read.mockRestore(); }
  });

  it("does not expose device-local Excalidraw scene procedures", async () => {
    const client = createDeviceControlClient({} as never);

    await expect(
      client.executePluginOperation(
        "organization",
        "local-workspace",
        "lunaris.excalidraw",
        "get_scene",
        { drawingId: "drawing-1" },
      ),
    ).rejects.toMatchObject({
      code: "PLUGIN_OPERATION_NOT_FOUND",
      status: 404,
    });
  });

  it("coalesces concurrent local workspace writes by idempotency key", async () => {
    let created:
      | {
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          updated_at: string;
          visibility: "local";
        }
      | undefined;
    let releaseWrite: (() => void) | undefined;
    const writeStarted = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    let unblockWrite: (() => void) | undefined;
    const writeBlocked = new Promise<void>((resolve) => {
      unblockWrite = resolve;
    });
    const db = {
      execute: vi.fn(async (query: string, params: unknown[]) => {
        if (!query.includes("INSERT INTO local_workspaces")) return;
        releaseWrite?.();
        await writeBlocked;
        created = {
          created_at: params[5] as string,
          id: params[0] as string,
          name: params[1] as string,
          organization_id: params[3] as string,
          slug: params[2] as string,
          updated_at: params[6] as string,
          visibility: params[4] as "local",
        };
      }),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("agent_idempotency")) return null;
        if (query.includes("slug = ?")) return null;
        return created ?? null;
      }),
    };
    const client = createDeviceControlClient(db as never);
    const input = {
      name: "Local workspace",
      slug: "local-workspace",
      visibility: "local" as const,
    };

    const firstRequest = client.createWorkspace("organization", input, {
      idempotencyKey: "same-request",
    });
    await writeStarted;
    const secondRequest = client.createWorkspace("organization", input, {
      idempotencyKey: "same-request",
    });
    expect(
      db.execute.mock.calls.filter(([query]) =>
        String(query).includes("INSERT INTO local_workspaces"),
      ),
    ).toHaveLength(1);
    unblockWrite?.();
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(first.visibility).toBe("local");
    expect(second).toEqual(first);
    expect(
      db.execute.mock.calls.filter(([query]) =>
        String(query).includes("INSERT INTO local_workspaces"),
      ),
    ).toHaveLength(1);
  });

  it("persists idempotency results across client recreation", async () => {
    const ledger = new Map<string, {
      id: string;
      key: string;
      operation: string;
      request_hash: string;
      response: string | null;
      status: string;
    }>();
    let created:
      | {
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          updated_at: string;
          visibility: "local";
        }
      | undefined;
    const db = {
      execute: vi.fn(async (query: string, params: unknown[]) => {
        if (
          query.includes("agent_idempotency") &&
          query.includes("INSERT")
        ) {
          ledger.set(String(params[4]), {
            id: String(params[0]),
            key: String(params[4]),
            operation: String(params[5]),
            request_hash: String(params[6]),
            response: null,
            status: "processing",
          });
        } else if (query.includes("UPDATE agent_idempotency")) {
          const row = [...ledger.values()].find(
            (candidate) => candidate.id === params[2],
          );
          if (row) {
            row.response = String(params[0]);
            row.status = String(params[1]);
          }
        } else if (query.includes("INSERT INTO local_workspaces")) {
          created = {
            created_at: String(params[5]),
            id: String(params[0]),
            name: String(params[1]),
            organization_id: String(params[3]),
            slug: String(params[2]),
            updated_at: String(params[6]),
            visibility: "local",
          };
        }
      }),
      getOptional: vi.fn(async (query: string, params: unknown[]) => {
        if (query.includes("agent_idempotency")) {
          return ledger.get(String(params[1])) ?? null;
        }
        if (query.includes("slug = ?")) return null;
        return created ?? null;
      }),
    };
    const input = {
      name: "Durable workspace",
      slug: "durable-workspace",
      visibility: "local" as const,
    };

    const first = await createDeviceControlClient(
      db as never,
    ).createWorkspace("organization", input, {
      idempotencyKey: "durable-request",
    });
    const secondClient = createDeviceControlClient(db as never);
    const second = await secondClient.createWorkspace("organization", input, {
      idempotencyKey: "durable-request",
    });

    expect(second).toEqual(first);
    expect(
      db.execute.mock.calls.filter(([query]) =>
        String(query).includes("INSERT INTO local_workspaces"),
      ),
    ).toHaveLength(1);
    await expect(
      secondClient.createWorkspace(
        "organization",
        { ...input, name: "Different workspace" },
        { idempotencyKey: "durable-request" },
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
  });

  it("queues shared workspace creation from cached state while offline", async () => {
    let created:
      | {
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          updated_at: string;
          visibility: "shared";
        }
      | undefined;
    const resolve = vi.fn(async () => ({
      completeness: "partial" as const,
      confirmedAt: null,
      syncState: "stale" as const,
    }));
    const db = {
      execute: vi.fn(async (query: string, params: unknown[]) => {
        if (!query.includes("INSERT INTO workspaces ")) return;
        created = {
          created_at: String(params[5]),
          id: String(params[0]),
          name: String(params[1]),
          organization_id: String(params[3]),
          slug: String(params[2]),
          updated_at: String(params[6]),
          visibility: "shared",
        };
      }),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("agent_idempotency")) return null;
        if (query.includes("slug = ?") || query.includes("local_workspaces")) {
          return null;
        }
        return created ?? null;
      }),
    };
    const client = createDeviceControlClient(db as never, {
      activeOrganizationId: () => "organization",
      readCoordinator: { dispose: vi.fn(), resolve },
    });

    await expect(
      client.createWorkspace(
        "organization",
        {
          name: "Offline shared",
          slug: "offline-shared",
          visibility: "shared",
        },
        { idempotencyKey: "offline-shared-create" },
      ),
    ).resolves.toMatchObject({
      name: "Offline shared",
      visibility: "shared",
    });
    expect(resolve).toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith(
      { kind: "workspaces" },
      expect.objectContaining({ consistency: "cached" }),
    );
  });

  it("persists, validates, expires, and single-uses destructive previews", async () => {
    let preview:
      | {
          action: "delete_workspace";
          actor_id: string;
          expires_at: string;
          fingerprint: string;
          id: string;
          target_id: string;
          token_hash: string;
          used_at: string | null;
          organization_id: string;
        }
      | undefined;
    const db = {
      execute: vi.fn(async (query: string, params: unknown[]) => {
        if (query.includes("INSERT INTO agent_action_previews")) {
          preview = {
            action: params[1] as "delete_workspace",
            actor_id: String(params[2]),
            expires_at: String(params[4]),
            fingerprint: String(params[5]),
            id: String(params[0]),
            target_id: String(params[7]),
            token_hash: String(params[8]),
            used_at: null,
            organization_id: String(params[10]),
          };
        } else if (
          query.includes("UPDATE agent_action_previews") &&
          preview
        ) {
          preview.used_at = String(params[0]);
        }
      }),
      getAll: vi.fn(async (query: string) =>
        query.includes("local_workspace_resources")
          ? [
              {
                id: "local-item",
                workspace_id: "local-workspace",
                updated_at: "2026-01-03T00:00:00.000Z",
              },
            ]
          : [],
      ),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("agent_idempotency")) return null;
        if (query.includes("agent_action_previews")) return preview ?? null;
        if (query.includes("local_workspaces")) return WORKSPACES[0];
        return null;
      }),
    };

    const issued = await createDeviceControlClient(
      db as never,
    ).previewDeleteWorkspace("organization", "local-workspace");
    const recreated = createDeviceControlClient(db as never);

    await expect(
      recreated.deleteWorkspace(
        "organization",
        "local-workspace",
        issued.previewToken,
        { idempotencyKey: "durable-delete" },
      ),
    ).resolves.toEqual({ id: "local-workspace" });
    expect(preview?.used_at).not.toBeNull();
    await expect(
      recreated.deleteWorkspace(
        "organization",
        "local-workspace",
        issued.previewToken,
        { idempotencyKey: "reused-preview" },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PREVIEW",
      status: 409,
    });

    const expired = await recreated.previewDeleteWorkspace(
      "organization",
      "local-workspace",
    );
    if (!preview) throw new Error("Expected stored preview");
    preview.expires_at = new Date(0).toISOString();
    await expect(
      recreated.deleteWorkspace(
        "organization",
        "local-workspace",
        expired.previewToken,
        { idempotencyKey: "expired-preview" },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PREVIEW",
      status: 409,
    });

    const changed = await recreated.previewDeleteWorkspace(
      "organization",
      "local-workspace",
    );
    if (!preview) throw new Error("Expected stored preview");
    preview.fingerprint = "changed";
    await expect(
      recreated.deleteWorkspace(
        "organization",
        "local-workspace",
        changed.previewToken,
        { idempotencyKey: "changed-preview" },
      ),
    ).rejects.toMatchObject({
      code: "PREVIEW_CHANGED",
      status: 409,
    });
  });

  it("enforces cached organization ownership before local reads and writes", async () => {
    const db = {
      execute: vi.fn(),
      getAll: vi.fn(),
    };
    const client = createDeviceControlClient(db as never, {
      organizations: () => [organization("organization")],
    });

    await expect(client.listWorkspaces("other-organization")).rejects.toMatchObject({
      code: "ORGANIZATION_NOT_FOUND",
      status: 404,
    });
    await expect(
      client.createWorkspace(
        "other-organization",
        {
          name: "Unauthorized workspace",
          slug: "unauthorized-workspace",
          visibility: "local",
        },
        { idempotencyKey: "unauthorized-request" },
      ),
    ).rejects.toMatchObject({
      code: "ORGANIZATION_NOT_FOUND",
      status: 404,
    });
    expect(db.getAll).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects workspace slug collisions during updates", async () => {
    const db = {
      execute: vi.fn(),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("agent_idempotency")) return null;
        return query.includes("id <> ?")
          ? { id: "other-workspace" }
          : WORKSPACES[0];
      }),
    };
    const client = createDeviceControlClient(db as never);

    await expect(
      client.updateWorkspace(
        "organization",
        "local-workspace",
        {
          expectedRevision: WORKSPACES[0].updated_at,
          slug: "taken",
        },
        { idempotencyKey: "update-workspace-slug" },
      ),
    ).rejects.toMatchObject({
      code: "WORKSPACE_SLUG_CONFLICT",
      status: 409,
    });
    expect(
      db.execute.mock.calls.some(([query]) =>
        String(query).includes("UPDATE local_workspaces"),
      ),
    ).toBe(false);
  });

  it("does not create a document for plugin-only items", async () => {
    let item:
      | {
          created_at: string;
          icon: null;
          id: string;
          name: string;
          parent_id: null;
          resource_type_id: string;
          schema_version: number;
          position: number;
          workspace_id: string;
          updated_at: string;
        }
      | undefined;
    const db = {
      execute: vi.fn(async (query: string, params: unknown[]) => {
        if (!query.includes("INSERT INTO local_workspace_resources")) return;
        item = {
          created_at: String(params[9]),
          icon: null,
          id: String(params[0]),
          name: String(params[2]),
          parent_id: null,
          resource_type_id: String(params[7]),
          schema_version: Number(params[8]),
          position: Number(params[4]),
          workspace_id: String(params[1]),
          updated_at: String(params[10]),
        };
      }),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("agent_idempotency")) return null;
        if (query.includes("MAX(position)")) return { value: null };
        if (query.includes("local_workspaces")) return WORKSPACES[0];
        if (query.includes("workspace_resources")) return item ?? null;
        return null;
      }),
    };

    const result = await createDeviceControlClient(
      db as never,
    ).createWorkspaceResource(
      "organization",
      "local-workspace",
      {
        name: "Extension panel",
        resourceTypeId: "lunaris.panel",
        schemaVersion: 1,
        storage: {},
      },
      { idempotencyKey: "plugin-only-item" },
    );

    expect(result).toMatchObject({
      resourceTypeId: "lunaris.panel",
      storage: {},
    });
    expect(
      db.execute.mock.calls.some(([query]) =>
        String(query).includes("local_yjs_documents"),
      ),
    ).toBe(false);
  });

  it("gets effective Kanban board properties from local data", async () => {
    const board = {
      created_at: "2026-01-01T00:00:00.000Z",
      yjs_backing_id: "board-document",
      icon: null,
      id: "board-1",
      name: "Board",
      parent_id: null,
      resource_type_id: "lunaris.kanban",
      position: 0,
      workspace_id: "local-workspace",
      updated_at: "2026-01-03T00:00:00.000Z",
    };
    const db = {
      getAll: vi.fn(async () => []),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("local_workspaces")) return WORKSPACES[0];
        if (query.includes("workspace_resources")) return board;
        if (query.includes("yjs_documents")) {
          return { id: board.yjs_backing_id };
        }
        return null;
      }),
    };

    const result = await createDeviceControlClient(
      db as never,
    ).executePluginOperation(
      "organization",
      "local-workspace",
      "lunaris.kanban",
      "get_board_properties",
      { boardId: board.id },
      { consistency: "cached" },
    );

    expect(result).toMatchObject({
      boardId: board.id,
      properties: [{ id: "status", name: "Status", type: "select" }],
    });
  });

  it("updates Rich Text documents in local workspace storage", async () => {
    const revision = "2026-01-03T00:00:00.000Z";
    const item = {
      created_at: "2026-01-01T00:00:00.000Z",
      yjs_backing_id: "rich-text-document",
      icon: null,
      id: "document-item-1",
      name: "Release plan",
      parent_id: null,
      resource_type_id: "lunaris.rich-text",
      position: 0,
      workspace_id: "local-workspace",
      updated_at: revision,
    };
    const { db, getUpdate } = createLocalDocumentHarness(item);

    const result = await createDeviceControlClient(
      db as never,
    ).executePluginOperation(
      "organization",
      "local-workspace",
      "lunaris.rich-text",
      "update_document",
      {
        blocks: [
          { id: "title", type: "heading", content: "Release plan" },
          { id: "body", type: "paragraph", content: "Ship safely" },
        ],
        documentResourceId: item.id,
        expectedRevision: revision,
      },
      { idempotencyKey: "rich-text-document-update" },
    );

    expect(result).toMatchObject({
      documentResourceId: item.id,
      blocks: [
        expect.objectContaining({ id: "title", type: "heading" }),
        expect.objectContaining({ id: "body", type: "paragraph" }),
      ],
      markdown: expect.stringContaining("Release plan"),
    });
    const doc = new Doc();
    applyUpdateV2(doc, getUpdate());
    expect((await getRichTextDocument(doc)).blocks.map(({ id }) => id)).toEqual([
      "title",
      "body",
    ]);
    doc.destroy();
  });

  it("rejects task deletion previews for non-task items", async () => {
    const board = {
      created_at: "2026-01-01T00:00:00.000Z",
      yjs_backing_id: "board-document",
      icon: null,
      id: "board-1",
      name: "Board",
      parent_id: null,
      resource_type_id: "lunaris.kanban",
      position: 0,
      workspace_id: "local-workspace",
      updated_at: "2026-01-03T00:00:00.000Z",
    };
    const db = {
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("local_workspaces")) return WORKSPACES[0];
        if (query.includes("workspace_resources")) return board;
        return null;
      }),
    };

    await expect(
      createDeviceControlClient(
        db as never,
      ).previewDeleteWorkspaceResource(
        "organization",
        "local-workspace",
        board.id,
        { expectedResourceTypeId: "lunaris.kanban.task" },
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
    });
  });

  it("rejects task creation under non-Kanban items", async () => {
    const folder = {
      created_at: "2026-01-01T00:00:00.000Z",
      icon: null,
      id: "folder-1",
      name: "Folder",
      parent_id: null,
      resource_type_id: null,
      position: 0,
      workspace_id: "local-workspace",
      updated_at: "2026-01-03T00:00:00.000Z",
    };
    const db = {
      execute: vi.fn(async () => undefined),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("agent_idempotency")) return null;
        if (query.includes("local_workspaces")) return WORKSPACES[0];
        if (query.includes("workspace_resources")) return folder;
        return null;
      }),
    };

    await expect(
      createDeviceControlClient(db as never).createWorkspaceResource(
        "organization",
        "local-workspace",
        {
          resourceTypeId: "lunaris.kanban.task",
          schemaVersion: 1,
          name: "Ship it",
          parentId: folder.id,
          storage: { content: { kind: "yjs" } },
        },
        {
          expectedParentResourceTypeId: "lunaris.kanban",
          idempotencyKey: "create-task",
        },
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
    });
  });

  it("creates Kanban tasks with board properties", async () => {
    const board = {
      created_at: "2026-01-01T00:00:00.000Z",
      yjs_backing_id: "board-document",
      icon: null,
      id: "board-1",
      name: "Board",
      parent_id: null,
      resource_type_id: "lunaris.kanban",
      position: 0,
      workspace_id: "local-workspace",
      updated_at: "2026-01-03T00:00:00.000Z",
    };
    let taskInsert: unknown[] | undefined;
    let updateB64: string | undefined;
    const initialDoc = new Doc();
    const properties = initialDoc.getArray<YMap<unknown>>("properties");
    const status = new YMap<unknown>();
    status.set("id", "status");
    status.set("name", "Status");
    status.set("type", "select");
    status.set(
      "options",
      JSON.stringify([
        { color: "#f59e0b", id: "in-progress", name: "In Progress" },
      ])
    );
    const assignees = new YMap<unknown>();
    assignees.set("id", "assignees");
    assignees.set("name", "Assignees");
    assignees.set("type", "people");
    properties.push([status, assignees]);
    const initialUpdateB64 = Uint8ArrayTob64(
      encodeStateAsUpdateV2(initialDoc)
    );
    initialDoc.destroy();
    const db = {
      execute: vi.fn(async (query: string, params: unknown[]) => {
        if (query.includes("INSERT INTO local_workspace_resources")) {
          taskInsert = params;
        }
        if (query.includes("INSERT INTO local_yjs_document_updates")) {
          updateB64 = String(params[4]);
        }
      }),
      getAll: vi.fn(async (query: string) => {
        if (query.includes("FROM member")) return [{ user_id: "user-1" }];
        if (query.includes("yjs_document_updates")) {
          return [{ update_b64: initialUpdateB64 }];
        }
        return [];
      }),
      getOptional: vi.fn(async (query: string) => {
        if (query.includes("agent_idempotency")) return null;
        if (query.includes("local_workspaces")) return WORKSPACES[0];
        if (query.includes("MAX(position)")) return { value: 2 };
        if (query.includes("workspace_resources")) return board;
        return null;
      }),
    };

    const result = await createDeviceControlClient(
      db as never,
    ).executePluginOperation(
      "organization",
      "local-workspace",
      "lunaris.kanban",
      "create_task",
      {
        boardId: board.id,
        name: "Ship it",
        properties: {
          Assignees: ["user-1"],
          Status: "In Progress",
        },
      },
      { idempotencyKey: "kanban-task-create" },
    );

    expect(result).toMatchObject({
      boardId: board.id,
      name: "Ship it",
      position: 3,
      properties: {
        assignees: ["user-1"],
        status: "in-progress",
      },
    });
    expect(taskInsert?.[5]).toBe(board.id);
    expect(taskInsert?.[6]).toBe("lunaris.kanban.task");
    expect(updateB64).toBeDefined();
    const doc = new Doc();
    applyUpdateV2(doc, b64ToUint8Array(updateB64!));
    expect(
      doc
        .getMap<YMap<unknown>>("taskAssignments")
        .get((result as { taskId: string }).taskId)
        ?.get("prop_status"),
    ).toBe("in-progress");
    expect(
      doc
        .getMap<YMap<unknown>>("taskAssignments")
        .get((result as { taskId: string }).taskId)
        ?.get("prop_assignees"),
    ).toEqual(["user-1"]);
    doc.destroy();
  });

  it("updates Kanban task properties in the board document", async () => {
    const board = {
      created_at: "2026-01-01T00:00:00.000Z",
      yjs_backing_id: "board-document",
      icon: null,
      id: "board-1",
      name: "Board",
      parent_id: null,
      resource_type_id: "lunaris.kanban",
      position: 0,
      workspace_id: "local-workspace",
      updated_at: "2026-01-03T00:00:00.000Z",
    };
    const task = {
      ...board,
      yjs_backing_id: "task-document",
      id: "task-1",
      name: "Task",
      parent_id: board.id,
      resource_type_id: "lunaris.kanban.task",
    };
    let updateB64: string | undefined;
    const db = {
      execute: vi.fn(async (query: string, params: unknown[]) => {
        if (
          query.includes("INSERT INTO local_yjs_document_updates")
        ) {
          updateB64 = String(params[4]);
        }
      }),
      getAll: vi.fn(async (query: string) =>
        query.includes("yjs_document_updates") ? [] : [],
      ),
      getOptional: vi.fn(async (query: string, params: unknown[]) => {
        if (query.includes("agent_idempotency")) return null;
        if (query.includes("local_workspaces")) return WORKSPACES[0];
        if (query.includes("workspace_resources")) {
          return params[0] === board.id ? board : task;
        }
        return null;
      }),
    };
    const result = await createDeviceControlClient(
      db as never,
    ).executePluginOperation(
      "organization",
      "local-workspace",
      "lunaris.kanban",
      "update_task",
      {
        boardId: board.id,
        properties: { Status: "Done" },
        taskId: task.id,
      },
      { idempotencyKey: "kanban-property-update" },
    );

    expect(result).toMatchObject({
      properties: { status: "done" },
      taskId: task.id,
    });
    expect(updateB64).toBeDefined();
    const doc = new Doc();
    applyUpdateV2(doc, b64ToUint8Array(updateB64!));
    expect(
      doc
        .getMap<YMap<string>>("taskAssignments")
        .get(task.id)
        ?.get("prop_status"),
    ).toBe("done");
    doc.destroy();
  });

  it("returns cached organizations and predictable cloud-required errors", async () => {
    const organization = {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "organization",
      logo: null,
      name: "Organization",
      revision: "revision",
      slug: "organization",
    };
    const client = createDeviceControlClient({} as never, {
      organizations: () => [organization],
    });

    await expect(client.listOrganizations()).resolves.toMatchObject({
      items: [{
        ...organization,
        provenance: {
          source: "cloud-cache",
          syncState: "unknown",
        },
      }],
      nextCursor: null,
    });
    await expect(
      client.listOrganizationMembers("organization"),
    ).rejects.toMatchObject({ code: "CLOUD_UNAVAILABLE", status: 503 });
  });
});

function organization(id: string) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id,
    logo: null,
    name: "Organization",
    revision: "revision",
    slug: id,
  };
}
