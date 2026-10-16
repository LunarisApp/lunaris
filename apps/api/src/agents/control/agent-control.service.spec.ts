import { describe, expect, it, mock } from "bun:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  AgentControlService,
  escapeLikePattern,
} from "./agent-control.service";
import { fingerprint } from "./safety/agent-safety.service";

describe("AgentControlService", () => {
  it("forwards explicit storage definitions to resource creation", async () => {
    const createResource = mock(() => Promise.resolve({ id: "item-1" }));
    const service = makeService({
      items: { create: createResource },
    });

    const result = await service.createResource({
      actorId: "user-1",
      input: {
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        name: "Draft",
        storage: { content: { kind: "yjs" } },
      },
      workspaceId: "workspace-1",
      organizationId: "organization-1",
    });
    expect(result.id).toBe("item-1");

    expect(createResource).toHaveBeenCalledWith(
      {
        name: "Draft",
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        storage: { content: { kind: "yjs" } },
      },
      "workspace-1",
      "organization-1",
      "user-1"
    );
  });

  it("allows resources without storage", async () => {
    const create = mock(() => Promise.resolve({ id: "item-1", storage: {} }));
    const createDocument = mock();
    const service = makeService({
      items: { create },
      yjs: { createWithDb: createDocument },
    });

    await service.createResource({
      actorId: "user-1",
      input: {
        resourceTypeId: "lunaris.rich-text",
        schemaVersion: 1,
        name: "Folder",
        storage: {},
      },
      workspaceId: "workspace-1",
      organizationId: "organization-1",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ storage: {} }),
      "workspace-1",
      "organization-1",
      "user-1"
    );
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("rejects task creation under a non-Kanban parent", async () => {
    const results = [[{ id: "workspace-1" }], []];
    const select = mock(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(results.shift()),
        }),
      }),
    }));
    const tx = { select };
    const transaction = mock((run: (value: typeof tx) => Promise<unknown>) =>
      run(tx)
    );
    const createDocument = mock();
    const createResource = mock();
    const service = makeService({
      database: { db: { transaction } },
      items: { createWithDb: createResource },
      yjs: { createWithDb: createDocument },
    });

    await expect(
      service.createResource({
        actorId: "user-1",
        expectedParentResourceTypeId: "lunaris.kanban",
        input: {
          resourceTypeId: "lunaris.kanban.task",
          schemaVersion: 1,
          name: "Ship it",
          parentId: "folder-1",
          storage: { content: { kind: "yjs" } },
        },
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(createDocument).not.toHaveBeenCalled();
    expect(createResource).not.toHaveBeenCalled();
  });

  it("reports every workspace document in destructive impact", async () => {
    const issuePreview = mock((input) => Promise.resolve(input));
    const service = makeService({ safety: { issuePreview } });
    const snapshot = {
      data: [{ id: "data-1", updatedAt: "2026-01-01T00:00:00.000Z" }],
      documents: [
        { id: "document-1", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "orphan-document", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      items: [],
      workspaceId: "workspace-1",
      revision: "revision-1",
    };
    Object.assign(service, {
      workspaceSnapshot: mock(() => Promise.resolve(snapshot)),
    });

    await service.previewWorkspace("organization-1", "workspace-1", "user-1");

    expect(issuePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: fingerprint(snapshot),
        impact: expect.objectContaining({ documents: 2 }),
      })
    );
  });

  it("requires ownership when deleting a private workspace", async () => {
    let deleteCondition: SQL | undefined;
    const tx = {
      delete: mock(() => ({
        where: mock((condition: SQL) => {
          deleteCondition = condition;
          return {
            returning: mock(() => Promise.resolve([{ id: "workspace-1" }])),
          };
        }),
      })),
    };
    const safety = {
      executePreview: mock(
        (input: { run: (database: typeof tx) => Promise<unknown> }) =>
          input.run(tx)
      ),
      idempotent: mock((input: { run: () => Promise<unknown> }) => input.run()),
    };
    const service = makeService({ safety });
    Object.assign(service, {
      workspaceSnapshot: mock(() =>
        Promise.resolve({
          data: [],
          documents: [],
          items: [],
          workspaceId: "workspace-1",
          revision: "revision-1",
        })
      ),
    });

    await service.deleteWorkspace({
      actorId: "user-1",
      idempotencyKey: "key-1",
      previewToken: "preview-1",
      workspaceId: "workspace-1",
      organizationId: "organization-1",
    });

    const query = new PgDialect().sqlToQuery(deleteCondition!);
    expect(query.sql).not.toContain("workspace_members");
    expect(query.params).toContain("private");
    expect(query.params).toContain("user-1");
  });

  it("rejects anonymous and missing agent accounts", async () => {
    const limit = mock(() => Promise.resolve([{ isAnonymous: true }]));
    const service = makeService({
      database: {
        db: {
          select: mock(() => ({
            from: mock(() => ({ where: mock(() => ({ limit })) })),
          })),
        },
      },
    });

    await expect(
      service.assertAgentEligible("anonymous-1")
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("serializes invitation admission and normalizes recipient email", async () => {
    const execute = mock(() => Promise.resolve());
    const queryResults = [
      [{ isPersonal: false, name: "Organization" }],
      [{ name: "Inviter" }],
      [],
    ];
    const select = mock(() => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(queryResults.shift()) }),
      }),
    }));
    const values = mock(() => ({
      returning: () =>
        Promise.resolve([
          {
            email: "person@example.com",
            id: "invitation-1",
            organizationId: "organization-1",
            role: "viewer",
            status: "pending",
          },
        ]),
    }));
    const tx = { execute, insert: () => ({ values }), select };
    const transaction = mock((run: (value: typeof tx) => Promise<unknown>) =>
      run(tx)
    );
    const send = mock(() => Promise.resolve());
    const service = makeService({
      appConfig: { frontendUrl: "https://app.lunaris.test" },
      database: { db: { transaction } },
      entitlements: {
        withMemberCapacity: mock(
          (_id: string, run: (tx: unknown) => Promise<unknown>) =>
            transaction(run)
        ),
      },
      resend: { emails: { send } },
    });

    const result = await service.inviteMember(
      "organization-1",
      { email: " Person@Example.com ", role: "viewer" },
      "user-1"
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ email: "person@example.com" })
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.email).toBe("person@example.com");
  });

  it("escapes LIKE wildcard characters for literal title search", () => {
    expect(escapeLikePattern(String.raw`plan%_\notes`)).toBe(
      String.raw`plan\%\_\\notes`
    );
  });

  it("searches one organization workspace and returns workspace context with a cursor", async () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const rows = [
      {
        createdAt: now,
        icon: null,
        id: "item-1",
        itemSortName: "plan",
        name: "Plan",
        parentId: null,
        resourceTypeId: "lunaris.folder",
        schemaVersion: 1,
        position: 0,
        workspaceId: "workspace-1",
        workspaceName: "Launch",
        storage: {},
        workspaceSortName: "launch",
        rank: 0,
        updatedAt: now,
      },
      {
        createdAt: now,
        documentId: "document-2",
        icon: null,
        id: "item-2",
        itemSortName: "planning notes",
        name: "Planning Notes",
        parentId: null,
        pluginId: "lunaris.kanban.task",
        position: 1,
        workspaceId: "workspace-1",
        workspaceName: "Launch",
        storage: {},
        workspaceSortName: "launch",
        rank: 1,
        updatedAt: now,
      },
    ];
    const limit = mock(() => Promise.resolve(rows));
    let searchCondition: SQL | undefined;
    const where = mock((condition: SQL) => {
      searchCondition = condition;
      return { orderBy: () => ({ limit }) };
    });
    const select = mock(() => ({
      from: () => ({
        innerJoin: () => ({
          where,
        }),
        where: () => Promise.resolve([]),
      }),
    }));
    const get = mock(() => Promise.resolve({ id: "workspace-1" }));
    const service = makeService({
      database: { db: { select } },
      workspaces: { get },
    });

    const result = await service.searchResources("organization-1", {
      limit: 1,
      workspaceId: "workspace-1",
      search: "plan",
    });

    expect(get).toHaveBeenCalledWith(
      "workspace-1",
      "organization-1",
      undefined
    );
    expect(limit).toHaveBeenCalledWith(2);
    const searchSql = new PgDialect().sqlToQuery(searchCondition!).sql;
    expect(searchSql).toContain('"workspace_resources"."name" ilike');
    expect(searchSql).toContain('"workspaces"."name" ilike');
    expect(result.items).toEqual([
      {
        createdAt: now.toISOString(),
        icon: null,
        id: "item-1",
        name: "Plan",
        parentId: null,
        resourceTypeId: "lunaris.folder",
        schemaVersion: 1,
        position: 0,
        workspaceId: "workspace-1",
        workspaceName: "Launch",
        provenance: {
          asOf: expect.any(String),
          source: "cloud-live",
          syncState: "current",
        },
        storage: {},
        updatedAt: now.toISOString(),
        lastActivityAt: now.toISOString(),
      },
    ]);
    expect(result.snapshot).toEqual({
      completeness: "complete",
      confirmedAt: expect.any(String),
      syncState: "current",
    });
    expect(
      JSON.parse(
        Buffer.from(result.nextCursor ?? "", "base64url").toString("utf8")
      )
    ).toEqual({
      resourceId: "item-1",
      itemName: "plan",
      workspaceName: "launch",
      rank: 0,
    });
  });

  it("rejects an invalid workspace before searching organization items", async () => {
    const error = new Error("Workspace not found");
    const select = mock(() => {
      throw new Error("search should not run");
    });
    const service = makeService({
      database: { db: { select } },
      workspaces: { get: mock(() => Promise.reject(error)) },
    });

    await expect(
      service.searchResources("organization-1", {
        workspaceId: "missing-workspace",
        search: "plan",
      })
    ).rejects.toBe(error);
    expect(select).not.toHaveBeenCalled();
  });
});

function makeService(
  overrides: {
    appConfig?: unknown;
    database?: unknown;
    entitlements?: unknown;
    files?: unknown;
    items?: unknown;
    workspaces?: unknown;
    resend?: unknown;
    safety?: unknown;
    yjs?: unknown;
  } = {}
) {
  return new AgentControlService(
    (overrides.appConfig ?? {}) as never,
    (overrides.database ?? {}) as never,
    (overrides.entitlements ?? {}) as never,
    (overrides.files ?? {}) as never,
    (overrides.items ?? {}) as never,
    (overrides.workspaces ?? {}) as never,
    (overrides.safety ?? {}) as never,
    (overrides.yjs ?? {}) as never,
    (overrides.resend ?? null) as never
  );
}
