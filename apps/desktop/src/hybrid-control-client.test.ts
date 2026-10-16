import type {
  ContentSnapshot,
  PendingAwareControlClient,
  Workspace,
  Organization,
} from "@repo/agent-contracts";
import { describe, expect, it, vi } from "vitest";
import { LunarisApiError } from "./agent-client/cloud-client";
import { createHybridControlClient } from "./hybrid-control-client";

const complete: ContentSnapshot = {
  completeness: "complete",
  confirmedAt: "2026-01-01T00:00:00.000Z",
  syncState: "current",
};
const partial: ContentSnapshot = {
  completeness: "partial",
  confirmedAt: "2026-01-01T00:00:00.000Z",
  syncState: "stale",
};

describe("createHybridControlClient", () => {
  it("uses complete local pages without cloud reads", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => ({
      items: [workspace("local", "local", 3)],
      nextCursor: null,
      snapshot: complete,
    }));

    const result = await createHybridControlClient(local, cloud).listWorkspaces(
      "organization"
    );

    expect(result.items.map(({ id }) => id)).toEqual(["local"]);
    expect(cloud.listWorkspaces).not.toHaveBeenCalled();
  });

  it("uses complete local organization metadata without another cloud read", async () => {
    const local = client();
    const cloud = client();
    local.listOrganizations = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      snapshot: complete,
    }));

    await expect(
      createHybridControlClient(local, cloud).listOrganizations()
    ).resolves.toMatchObject({ snapshot: complete });
    expect(local.listOrganizations).toHaveBeenCalledWith(
      { cursor: undefined, limit: 51 },
      { consistency: "cached", signal: undefined }
    );
    expect(cloud.listOrganizations).not.toHaveBeenCalled();
  });

  it("uses cloud when local organization metadata is incomplete", async () => {
    const local = client();
    const cloud = client();
    local.listOrganizations = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      snapshot: partial,
    }));
    cloud.listOrganizations = vi.fn(async () => ({
      items: [],
      nextCursor: null,
    }));

    await createHybridControlClient(local, cloud).listOrganizations();

    expect(cloud.listOrganizations).toHaveBeenCalledOnce();
  });

  it("keeps organization pagination valid when read source changes", async () => {
    const local = client();
    const cloud = client();
    let snapshot = complete;
    const organizations = [
      organization("alice", "Alice"),
      organization("bob", "Bob"),
    ];
    local.listOrganizations = vi.fn(async () => ({
      items: organizations,
      nextCursor: null,
      snapshot,
    }));
    cloud.listOrganizations = vi.fn(async () => ({
      items: organizations,
      nextCursor: null,
      snapshot: complete,
    }));
    const hybrid = createHybridControlClient(local, cloud);

    const first = await hybrid.listOrganizations({ limit: 1 });
    snapshot = partial;
    const second = await hybrid.listOrganizations({
      cursor: first.nextCursor ?? undefined,
      limit: 1,
    });

    expect(first.items.map(({ id }) => id)).toEqual(["alice"]);
    expect(second.items.map(({ id }) => id)).toEqual(["bob"]);
    expect(cloud.listOrganizations).toHaveBeenCalledWith(
      { cursor: undefined, limit: 2 },
      undefined
    );
  });

  it("merges partial local and cloud pages with local precedence", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => ({
      items: [
        workspace("shared", "shared", 5, "Local pending", "current"),
        workspace("local", "local", 4),
      ],
      nextCursor: null,
      snapshot: partial,
    }));
    cloud.listWorkspaces = vi.fn(async () => ({
      items: [
        workspace("shared", "shared", 3, "Cloud stale"),
        workspace("remote", "shared", 2),
      ],
      nextCursor: null,
    }));

    const result = await createHybridControlClient(local, cloud).listWorkspaces(
      "organization"
    );

    expect(result.items.map(({ id }) => id)).toEqual([
      "shared",
      "local",
      "remote",
    ]);
    expect(result.items[0]?.name).toBe("Local pending");
    expect(result.snapshot?.completeness).toBe("complete");
  });

  it("uses versioned cursors across merged pages", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => ({
      items: [workspace("local", "local", 4)],
      nextCursor: null,
      snapshot: partial,
    }));
    cloud.listWorkspaces = vi.fn(async () => ({
      items: [workspace("one", "shared", 3), workspace("two", "shared", 2)],
      nextCursor: null,
    }));
    const hybrid = createHybridControlClient(local, cloud);

    const first = await hybrid.listWorkspaces("organization", { limit: 2 });
    const second = await hybrid.listWorkspaces("organization", {
      cursor: first.nextCursor ?? undefined,
      limit: 2,
    });

    expect(first.items.map(({ id }) => id)).toEqual(["local", "one"]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map(({ id }) => id)).toEqual(["two"]);
    await expect(
      hybrid.listWorkspaces("organization", { cursor: "cloud-cursor" })
    ).rejects.toMatchObject({ code: "INVALID_CURSOR", status: 400 });
  });

  it("keeps keyset pagination stable when earlier results appear", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => ({
      items: [workspace("local", "local", 4)],
      nextCursor: null,
      snapshot: partial,
    }));
    let cloudWorkspaces = [
      workspace("one", "shared", 3),
      workspace("two", "shared", 2),
    ];
    cloud.listWorkspaces = vi.fn(async () => ({
      items: cloudWorkspaces,
      nextCursor: null,
    }));
    const hybrid = createHybridControlClient(local, cloud);

    const first = await hybrid.listWorkspaces("organization", { limit: 2 });
    cloudWorkspaces = [workspace("new", "shared", 5), ...cloudWorkspaces];
    const second = await hybrid.listWorkspaces("organization", {
      cursor: first.nextCursor ?? undefined,
      limit: 2,
    });

    expect(first.items.map(({ id }) => id)).toEqual(["local", "one"]);
    expect(second.items.map(({ id }) => id)).toEqual(["two"]);
  });

  it("overlays pending PowerSync updates and deletes on cloud pages", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => ({
      items: [workspace("updated", "shared", 2, "Pending local", "stale")],
      nextCursor: null,
      snapshot: partial,
    }));
    local.pendingContentChanges = vi.fn(async () => ({
      complete: true,
      deletes: { workspaces: ["deleted"] },
      documents: [],
      storageIds: [],
      upserts: { workspaces: ["updated"] },
    }));
    cloud.listWorkspaces = vi.fn(async () => ({
      items: [
        workspace("deleted", "shared", 4),
        workspace("updated", "shared", 3, "Cloud"),
      ],
      nextCursor: null,
    }));

    const result = await createHybridControlClient(local, cloud).listWorkspaces(
      "organization"
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "updated",
      name: "Pending local",
    });
  });

  it("keeps pending exact item reads local", async () => {
    const local = client();
    const cloud = client();
    local.getWorkspace = vi.fn(async () =>
      workspace("shared", "shared", 2, "Shared", "stale")
    );
    local.getWorkspaceResource = vi.fn(async () => ({
      createdAt: "2026-01-01T00:00:00.000Z",
      icon: null,
      id: "item",
      name: "Pending local",
      parentId: null,
      resourceTypeId: "lunaris.folder",
      schemaVersion: 1,
      storage: {},
      position: 0,
      workspaceId: "shared",
      provenance: {
        asOf: "2026-01-02T00:00:00.000Z",
        source: "cloud-cache" as const,
        syncState: "stale" as const,
      },
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));
    local.pendingContentChanges = vi.fn(async () => ({
      complete: true,
      deletes: {},
      documents: [],
      storageIds: [],
      upserts: { workspace_resources: ["item"] },
    }));

    await expect(
      createHybridControlClient(local, cloud).getWorkspaceResource(
        "organization",
        "shared",
        "item"
      )
    ).resolves.toMatchObject({ name: "Pending local" });
    expect(cloud.getWorkspaceResource).not.toHaveBeenCalled();
  });

  it("returns stale local data adaptively but keeps confirmed strict", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => ({
      items: [workspace("cached", "shared", 1)],
      nextCursor: null,
      snapshot: partial,
    }));
    cloud.listWorkspaces = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const hybrid = createHybridControlClient(local, cloud);

    await expect(hybrid.listWorkspaces("organization")).resolves.toMatchObject({
      items: [{ id: "cached" }],
      snapshot: partial,
    });
    await expect(
      hybrid.listWorkspaces("organization", {}, { consistency: "confirmed" })
    ).rejects.toMatchObject({ code: "INCOMPLETE_SYNC", status: 409 });
  });

  it("uses cloud for lazy Yjs storage despite a complete workspace index", async () => {
    const local = client();
    const cloud = client();
    local.getWorkspace = vi.fn(async () =>
      workspace("shared", "shared", 2, "Shared", "current")
    );
    local.getYjsStorageJson = vi.fn(
      async (_organizationId, _workspaceId, _storageId, options) => {
        if (options?.consistency === "confirmed") {
          throw Object.assign(new Error("not hydrated"), {
            code: "INCOMPLETE_SYNC",
            status: 409,
          });
        }
        return {
          resourceTypeId: "rich-text",
          data: { text: "cached" },
          resourceId: "resource",
          storageId: "storage",
          provenance: {
            asOf: "2026-01-01T00:00:00.000Z",
            source: "cloud-cache" as const,
            syncState: "stale" as const,
          },
          revision: "cached",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      }
    );
    cloud.getYjsStorageJson = vi.fn(async () => ({
      resourceTypeId: "rich-text",
      data: { text: "live" },
      resourceId: "resource",
      storageId: "storage",
      provenance: {
        asOf: "2026-01-02T00:00:00.000Z",
        source: "cloud-live" as const,
        syncState: "current" as const,
      },
      revision: "live",
      updatedAt: "2026-01-02T00:00:00.000Z",
    }));

    await expect(
      createHybridControlClient(local, cloud).getYjsStorageJson(
        "organization",
        "shared",
        "storage"
      )
    ).resolves.toMatchObject({ data: { text: "live" } });
    expect(cloud.getYjsStorageJson).toHaveBeenCalledOnce();
  });

  it("proxies inactive organization lists when no local cache exists", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => {
      throw Object.assign(new Error("inactive organization"), {
        code: "INCOMPLETE_SYNC",
        status: 409,
      });
    });
    cloud.listWorkspaces = vi.fn(async () => ({
      items: [workspace("remote", "shared", 2)],
      nextCursor: null,
    }));

    await expect(
      createHybridControlClient(local, cloud).listWorkspaces("inactive")
    ).resolves.toMatchObject({ items: [{ id: "remote" }] });
    expect(cloud.listWorkspaces).toHaveBeenCalled();
  });

  it("propagates cloud application errors without cached fallback", async () => {
    const local = client();
    const cloud = client();
    local.listWorkspaces = vi.fn(async () => ({
      items: [workspace("cached", "shared", 1)],
      nextCursor: null,
      snapshot: partial,
    }));
    cloud.listWorkspaces = vi.fn(async () => {
      throw new LunarisApiError("Forbidden", 403, "FORBIDDEN");
    });

    await expect(
      createHybridControlClient(local, cloud).listWorkspaces("organization")
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      exposeToAgent: true,
      status: 403,
    });
  });

  it("proxies administration and reports offline cloud requirements", async () => {
    const local = client();
    const cloud = client();
    cloud.listOrganizationMembers = vi.fn(async () => ({
      items: [],
      nextCursor: null,
    }));
    const hybrid = createHybridControlClient(local, cloud);

    await expect(
      hybrid.listOrganizationMembers("organization")
    ).resolves.toMatchObject({ items: [] });
    expect(local.listOrganizationMembers).not.toHaveBeenCalled();

    cloud.listOrganizationMembers = vi.fn(async () => {
      throw new TypeError("offline");
    });
    await expect(
      createHybridControlClient(local, cloud).listOrganizationMembers(
        "organization"
      )
    ).rejects.toMatchObject({
      code: "CLOUD_UNAVAILABLE",
      status: 503,
    });
  });

  it("keeps local workspaces and all workspace mutations local", async () => {
    const local = client();
    const cloud = client();
    const localWorkspace = workspace("local", "local", 1);
    local.getWorkspace = vi.fn(async () => localWorkspace);
    local.createWorkspace = vi.fn(async () => localWorkspace);
    cloud.getWorkspace = vi.fn(async () => {
      throw new Error("must not run");
    });
    const hybrid = createHybridControlClient(local, cloud);

    await expect(hybrid.getWorkspace("organization", "local")).resolves.toEqual(
      localWorkspace
    );
    await expect(
      hybrid.createWorkspace(
        "organization",
        {
          name: "Local workspace",
          slug: "local-workspace",
          visibility: "local",
        },
        { idempotencyKey: "local-create" }
      )
    ).resolves.toEqual(localWorkspace);
    expect(cloud.getWorkspace).not.toHaveBeenCalled();
    expect(cloud.createWorkspace).not.toHaveBeenCalled();
  });

  it("keeps offline-supported plugin property reads local", async () => {
    const local = client();
    const cloud = client();
    local.executePluginOperation = vi.fn(async () => ({
      boardId: "board-1",
      properties: [],
    }));

    await createHybridControlClient(local, cloud).executePluginOperation(
      "organization",
      "workspace",
      "lunaris.kanban",
      "get_board_properties",
      { boardId: "board-1" }
    );

    expect(local.executePluginOperation).toHaveBeenCalledOnce();
    expect(cloud.executePluginOperation).not.toHaveBeenCalled();
  });
});

function client(): PendingAwareControlClient {
  const methods = new Map<PropertyKey, ReturnType<typeof vi.fn>>();
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        const existing = methods.get(property);
        if (existing) {
          return existing;
        }
        const method = vi.fn();
        methods.set(property, method);
        return method;
      },
      set: (_target, property, value) => {
        methods.set(property, value);
        return true;
      },
    }
  ) as PendingAwareControlClient;
}

function workspace(
  id: string,
  visibility: "local" | "shared",
  order: number,
  name = id,
  syncState: "current" | "stale" = "stale"
): Workspace {
  const updatedAt = `2026-01-0${order}T00:00:00.000Z`;
  return {
    createdAt: updatedAt,
    id,
    name,
    organizationId: "organization",
    provenance: {
      asOf: updatedAt,
      source: visibility === "local" ? "device-local" : "cloud-cache",
      syncState: visibility === "local" ? "current" : syncState,
    },
    slug: id,
    updatedAt,
    visibility,
  };
}

function organization(id: string, name: string): Organization {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id,
    logo: null,
    name,
    provenance: {
      asOf: "2026-01-01T00:00:00.000Z",
      source: "cloud-cache",
      syncState: "current",
    },
    revision: id,
    slug: id,
  };
}
