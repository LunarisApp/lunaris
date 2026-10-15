import { beforeEach, describe, expect, it, type Mock, mock } from "bun:test";
import { DatabaseService } from "@app/db";
import { Test, TestingModule } from "@nestjs/testing";
import { permission } from "@repo/auth/permissions";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { EntitlementsService } from "../entitlements";
import { OrganizationResourceLimitError } from "../entitlements/core/entitlements.errors";
import { PermissionService } from "../security/permissions/permission.service";
import { organization } from "../auth/auth.entity";
import { SyncService } from "./sync.service";

// biome-ignore lint/suspicious/noExplicitAny: test mocks
const mockSignJWT = mock() as Mock<(...args: any[]) => any>;

const mockValues = mock() as Mock<(...args: unknown[]) => unknown>;
const mockOnConflictDoUpdate = mock(() => Promise.resolve(undefined));
const mockWhere = mock(() => Promise.resolve(undefined)) as Mock<
  (...args: unknown[]) => unknown
>;

/** Configurable select mock: set mockSelectResult before each test. */
let mockSelectResult: unknown[] = [];
let mockSelectResultsQueue: unknown[][] = [];
function resolveSelectResult() {
  return mockSelectResultsQueue.shift() ?? mockSelectResult;
}
function makeQueryableRows() {
  let resolved = false;
  let rows: unknown[] = [];
  const getRows = () => {
    if (!resolved) {
      rows = resolveSelectResult();
      resolved = true;
    }
    return rows;
  };
  return {
    for: mock(() => Promise.resolve(getRows())),
    limit: mock(() => Promise.resolve(getRows())),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(getRows()).then(resolve, reject),
  };
}

const mockFromChain = (table?: unknown) => table === organization
  ? { where: () => ({ for: async () => [{ id: ORG_ID }] }) }
  : ({
  where: mock(() => makeQueryableRows()),
  innerJoin: mock(() => ({
    where: mock(() => makeQueryableRows()),
  })),
});
const mockSelect = mock(() => ({
  from: mock(mockFromChain),
})) as Mock<(...args: unknown[]) => unknown>;

function makeAwaitableRows() {
  let resolved = false;
  let rows: unknown[] = [];
  const getRows = () => {
    if (!resolved) {
      rows = resolveSelectResult();
      resolved = true;
    }
    return rows;
  };

  return {
    for: mock(() => Promise.resolve(getRows())),
    then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(getRows()).then(resolve, reject),
  };
}

const mockLockedFromChain = (table?: unknown) => table === organization
  ? { where: () => ({ for: async () => [{ id: ORG_ID }] }) }
  : ({
  where: mock(() => makeAwaitableRows()),
  innerJoin: mock(() => ({
    where: mock(() => Promise.resolve(resolveSelectResult())),
  })),
});

const mockDb = {
  execute: mock(() => Promise.resolve()),
  insert: mock(() => ({ values: mockValues })),
  update: mock(() => ({
    set: mock(() => ({ where: mockWhere })),
  })),
  delete: mock(() => ({ where: mockWhere })),
  select: mockSelect,
  transaction: mock(async (callback: (tx: typeof mockDb) => Promise<void>) =>
    callback(mockDb)
  ),
  values: mockValues,
  where: mockWhere,
};

const ORG_ID = "org-1";
const USER_ID = "user-123";

function makeDrizzleUniqueError(constraint = "workspaces_org_slug_unique") {
  return Object.assign(new Error("Failed query"), {
    cause: {
      code: "23505",
      constraint,
    },
  });
}

describe("SyncService", () => {
  let service: SyncService;
  let assertCanCreateResource: ReturnType<typeof mock>;
  let getOrganizationRole: ReturnType<typeof mock>;
  let requirePermission: ReturnType<typeof mock>;

  beforeEach(async () => {
    mockSignJWT.mockReset();
    mockOnConflictDoUpdate.mockReset().mockImplementation(() =>
      Promise.resolve(undefined)
    );
    mockValues.mockReset().mockImplementation(() => ({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    }));
    mockSelectResult = [];
    mockSelectResultsQueue = [];
    mockSelect.mockReset().mockImplementation(() => ({
      from: mock(mockFromChain),
    }) as never);
    mockDb.transaction.mockReset().mockImplementation(async (callback) =>
      callback(mockDb)
    );
    mockWhere.mockReset().mockImplementation(() => Promise.resolve(undefined));
    mockDb.insert
      .mockReset()
      .mockImplementation(() => ({ values: mockValues }));
    mockDb.update.mockReset().mockImplementation(() => ({
      set: mock(() => ({ where: mockWhere })),
    }));
    mockDb.delete.mockReset().mockImplementation(() => ({ where: mockWhere }));
    mockDb.execute.mockReset().mockImplementation(() => Promise.resolve());
    const authService = {
      api: { signJWT: mockSignJWT },
    } as unknown as AuthService;
    assertCanCreateResource = mock(async () => undefined);
    getOrganizationRole = mock(async () => "owner");
    requirePermission = mock(async () => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: DatabaseService, useValue: { db: mockDb } },
        { provide: AuthService, useValue: authService },
        {
          provide: EntitlementsService,
          useValue: { assertCanCreateResource },
        },
        {
          provide: PermissionService,
          useValue: { getOrganizationRole, requirePermission },
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it("does not let activity hints bypass permissions on mixed patches", async () => {
    requirePermission.mockImplementationOnce(async () => { throw new Error("permission denied"); });
    await expect(service.ingest([{ crud: [{
      op: "PATCH", type: "workspaces", id: "workspace-1",
      data: { name: "Unauthorized", last_activity_at: "2026-09-09T10:00:00.000Z" },
    }] }], ORG_ID, USER_ID)).rejects.toThrow("permission denied");
    expect(requirePermission).toHaveBeenCalledWith(permission.workspace.update, expect.anything());
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("acknowledges activity-only hints without requiring owner permissions or writing", async () => {
    await service.ingest([{ crud: [{
      op: "PATCH", type: "workspaces", id: "workspace-1",
      data: { last_activity_at: "2026-09-09T10:00:00.000Z" },
    }] }], ORG_ID, USER_ID);
    expect(requirePermission).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should process PUT operation", async () => {
    await service.ingest(
      [
        {
          crud: [
            {
              op: "PUT",
              type: "workspaces",
              id: "test-1",
              data: {
                name: "Test",
                slug: "test",
                organization_id: ORG_ID,
                created_at: "2024-01-01T00:00:00Z",
              },
            },
          ],
        },
      ],
      ORG_ID
    );

    expect(mockDb.insert).toHaveBeenCalled();
    expect(requirePermission).toHaveBeenCalledWith(
      permission.workspace.create,
      {
        organizationId: ORG_ID,
        role: "owner",
        userId: undefined,
      },
    );
  });

  it("assigns private cloud workspaces to the authenticated user", async () => {
    await service.ingest(
      [
        {
          crud: [
            {
              op: "PUT",
              type: "workspaces",
              id: "private-1",
              data: {
                name: "Private",
                slug: "private",
                organization_id: ORG_ID,
                visibility: WORKSPACE_VISIBILITY.private,
              },
            },
          ],
        },
      ],
      ORG_ID,
      USER_ID,
    );

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: USER_ID,
        visibility: WORKSPACE_VISIBILITY.private,
      }),
    );
  });

  it("rejects private cloud workspaces without an authenticated user", async () => {
    await expect(
      service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "private-1",
                data: {
                  name: "Private",
                  slug: "private",
                  organization_id: ORG_ID,
                  visibility: WORKSPACE_VISIBILITY.private,
                },
              },
            ],
          },
        ],
        ORG_ID,
      ),
    ).rejects.toThrow("Private workspace owner is required");

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("does not assign owners to shared workspaces", async () => {
    await service.ingest(
      [
        {
          crud: [
            {
              op: "PUT",
              type: "workspaces",
              id: "shared-1",
              data: {
                name: "Shared",
                slug: "shared",
                organization_id: ORG_ID,
                visibility: WORKSPACE_VISIBILITY.shared,
              },
            },
          ],
        },
      ],
      ORG_ID,
      USER_ID,
    );

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: null,
        visibility: WORKSPACE_VISIBILITY.shared,
      }),
    );
  });

  it("blocks workspace resource growth when organization resource limit is reached", async () => {
    assertCanCreateResource.mockImplementation(async () => {
      throw new OrganizationResourceLimitError(25);
    });

    await expect(
      service.ingest(
        [{
          crud: [{
            op: "PUT",
            type: "workspace_resources",
            id: "item-26",
            data: {
              workspace_id: "workspace-1",
              name: "Blocked",
              position: 25,
              parent_id: null,
              created_at: "2026-07-19T00:00:00.000Z",
              updated_at: "2026-07-19T00:00:00.000Z",
            },
          }],
        }],
        ORG_ID,
      ),
    ).rejects.toThrow(OrganizationResourceLimitError);
    expect(assertCanCreateResource).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("no-ops owned workspace resource PUT replays before resource-capacity checks", async () => {
    mockSelectResultsQueue = [
      [{ id: "item-25" }],
      [{ orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared }],
    ];
    assertCanCreateResource.mockImplementation(async () => {
      throw new OrganizationResourceLimitError(25);
    });

    await service.ingest(
      [{
        crud: [{
          op: "PUT",
          type: "workspace_resources",
          id: "item-25",
          data: {
            workspace_id: "workspace-1",
            name: "Already synced",
            position: 24,
            parent_id: null,
          },
        }],
      }],
      ORG_ID,
    );

    expect(assertCanCreateResource).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("rejects workspace resource PUT replays owned by another organization", async () => {
    mockSelectResultsQueue = [
      [{ id: "item-25" }],
      [{ orgId: "other-org", visibility: WORKSPACE_VISIBILITY.shared }],
    ];

    await expect(
      service.ingest(
        [{
          crud: [{
            op: "PUT",
            type: "workspace_resources",
            id: "item-25",
            data: {
              workspace_id: "workspace-1",
              name: "Foreign item",
              position: 24,
              parent_id: null,
            },
          }],
        }],
        ORG_ID,
      ),
    ).rejects.toThrow("Child entity does not belong to organization");

    expect(assertCanCreateResource).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("should coerce string timestamps to Date objects", async () => {
    await service.ingest(
      [
        {
          crud: [
            {
              op: "PUT",
              type: "workspaces",
              id: "test-2",
              data: {
                name: "Timestamped",
                slug: "ts",
                organization_id: ORG_ID,
                created_at: "2024-06-15T12:30:00Z",
              },
            },
          ],
        },
      ],
      ORG_ID
    );

    const insertedValues = mockValues.mock.calls[0][0] as any;
    expect(insertedValues.createdAt).toBeInstanceOf(Date);
    expect(insertedValues.createdAt.toISOString()).toBe(
      "2024-06-15T12:30:00.000Z"
    );
  });

  it("should process DELETE operation", async () => {
    mockSelectResult = [{ id: "test-1" }];
    await service.ingest(
      [
        {
          crud: [{ op: "DELETE", type: "workspaces", id: "test-1" }],
        },
      ],
      ORG_ID
    );

    expect(mockDb.delete).toHaveBeenCalled();
  });

  it("should reject unknown table entries", async () => {
    await expect(
      service.ingest(
        [
          {
            crud: [{ op: "PUT", type: "unknown_table", id: "x", data: {} }],
          },
        ],
        ORG_ID
      )
    ).rejects.toThrow("Unknown table");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  describe("authorization", () => {
    it("workspaces PUT with matching orgId succeeds", async () => {
      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "p1",
                data: { name: "P", slug: "p", organization_id: ORG_ID },
              },
            ],
          },
        ],
        ORG_ID
      );
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("workspaces PUT with wrong orgId rejects the transaction", async () => {
      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p1",
                  data: { name: "P", slug: "p", organization_id: "other-org" },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("Workspace does not belong to organization");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("workspaces PATCH owned succeeds", async () => {
      mockSelectResult = [{ id: "p1" }];
      await service.ingest(
        [
          {
            crud: [
              {
                op: "PATCH",
                type: "workspaces",
                id: "p1",
                data: { name: "Updated" },
              },
            ],
          },
        ],
        ORG_ID
      );
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("workspaces PATCH unowned rejects the transaction", async () => {
      mockSelectResult = [];
      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PATCH",
                  type: "workspaces",
                  id: "p1",
                  data: { name: "Hacked" },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("Workspace does not belong to organization");
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("workspace_resources PATCH rejects cross-workspace parent moves", async () => {
      mockSelect.mockImplementation(() => ({
        from: mock(mockLockedFromChain),
      }) as never);
      mockSelectResultsQueue = [
        [{ orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared }],
        [{ id: "item-1", workspaceId: "workspace-1" }],
        [{ id: "folder-2", workspaceId: "workspace-2" }],
      ];

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PATCH",
                  type: "workspace_resources",
                  id: "item-1",
                  data: { parent_id: "folder-2" },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("Workspace resource parent not found");

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("authorizes workspace resource ownership before checking documents", async () => {
      mockSelectResultsQueue = [[{ orgId: "other-org" }]];

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PATCH",
                  type: "workspace_resources",
                  id: "foreign-item",
                  data: { name: "Blocked" },
                },
              ],
            },
          ],
          ORG_ID,
        ),
      ).rejects.toThrow("Child entity does not belong to organization");

      expect(mockDb.execute).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("workspace_resources PATCH rejects self-parenting", async () => {
      mockSelect.mockImplementation(() => ({
        from: mock(mockLockedFromChain),
      }) as never);
      mockSelectResultsQueue = [
        [{ orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared }],
        [{ id: "item-1", workspaceId: "workspace-1" }],
      ];

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PATCH",
                  type: "workspace_resources",
                  id: "item-1",
                  data: { parent_id: "item-1" },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("Invalid workspace resource parent");

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("workspace_resources PATCH rejects descendant-parent cycles", async () => {
      mockSelect.mockImplementation(() => ({
        from: mock(mockLockedFromChain),
      }) as never);
      mockSelectResultsQueue = [
        [{ orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared }],
        [{ id: "folder-1", workspaceId: "workspace-1", parentId: null }],
        [{ id: "item-1", workspaceId: "workspace-1", parentId: "folder-1" }],
        [],
        [{ id: "folder-1", workspaceId: "workspace-1", parentId: null }],
      ];

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PATCH",
                  type: "workspace_resources",
                  id: "folder-1",
                  data: { parent_id: "item-1" },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("Invalid workspace resource parent");

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("workspace_resources PUT rejects foreign-workspace parents", async () => {
      mockSelectResultsQueue = [
        [],
        [{ id: "workspace-1" }],
        [{ id: "folder-2", workspaceId: "workspace-2" }],
      ];

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspace_resources",
                  id: "item-1",
                  data: {
                    name: "Doc",
                    parent_id: "folder-2",
                    workspace_id: "workspace-1",
                  },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("Workspace resource parent not found");

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("workspace_resources PATCH allows same-workspace parent moves", async () => {
      mockSelect.mockImplementation(() => ({
        from: mock(mockLockedFromChain),
      }) as never);
      mockSelectResultsQueue = [
        [{ orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared }],
        [{ id: "item-1", workspaceId: "workspace-1" }],
        [{ id: "folder-1", workspaceId: "workspace-1" }],
      ];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PATCH",
                type: "workspace_resources",
                id: "item-1",
                data: { parent_id: "folder-1" },
              },
            ],
          },
        ],
        ORG_ID
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("workspace_resources PATCH without parent_id skips the locking transaction path", async () => {
      mockSelectResult = [
        { orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared },
      ];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PATCH",
                type: "workspace_resources",
                id: "item-1",
                data: { name: "Renamed" },
              },
            ],
          },
        ],
        ORG_ID
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("workspaces DELETE owned succeeds", async () => {
      mockSelectResult = [{ id: "p1" }];
      await service.ingest(
        [{ crud: [{ op: "DELETE", type: "workspaces", id: "p1" }] }],
        ORG_ID
      );
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("workspaces DELETE unowned rejects the transaction", async () => {
      mockSelectResult = [];
      await expect(
        service.ingest(
          [{ crud: [{ op: "DELETE", type: "workspaces", id: "p1" }] }],
          ORG_ID
        )
      ).rejects.toThrow("Workspace does not belong to organization");
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("rejects permanent deletion of an active workspace resource", async () => {
      await expect(
        service.ingest(
          [
            {
              crud: [
                { op: "DELETE", type: "workspace_resources", id: "item-1" },
              ],
            },
          ],
          ORG_ID,
        ),
      ).rejects.toThrow("must be trashed before permanent deletion");
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("allows permanent deletion of a trashed workspace resource", async () => {
      mockSelectResultsQueue = [
        [{ id: "item-1" }],
        [{ id: "item-1" }],
        [{ orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared }],
      ];

      await service.ingest(
        [
          {
            crud: [
              { op: "DELETE", type: "workspace_resources", id: "item-1" },
            ],
          },
        ],
        ORG_ID,
      );

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("rejects restoring an expired workspace resource tombstone", async () => {
      mockSelectResultsQueue = [
        [{ id: "item-1", purgeAt: new Date("2000-01-01T00:00:00.000Z") }],
      ];

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "DELETE",
                  type: "workspace_resource_trash",
                  id: "item-1",
                },
              ],
            },
          ],
          ORG_ID,
        ),
      ).rejects.toThrow("Expired workspace resource trash cannot be restored");
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("allows restoring an unexpired workspace resource tombstone", async () => {
      mockSelectResultsQueue = [
        [{ id: "item-1", purgeAt: new Date("2999-01-01T00:00:00.000Z") }],
        [{ orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared }],
      ];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "DELETE",
                type: "workspace_resource_trash",
                id: "item-1",
              },
            ],
          },
        ],
        ORG_ID,
      );

      expect(assertCanCreateResource).toHaveBeenCalledTimes(1);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("yjs_document_updates PATCH rejects the transaction", async () => {
      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PATCH",
                  type: "yjs_document_updates",
                  id: "u1",
                  data: {},
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("yjs_document_updates cannot be patched");
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("workspaces PATCH strips immutable keys", async () => {
      mockSelectResult = [{ id: "p1" }];
      await service.ingest(
        [
          {
            crud: [
              {
                op: "PATCH",
                type: "workspaces",
                id: "p1",
                data: {
                  name: "New Name",
                  organization_id: "evil-org",
                  created_at: "2024-01-01T00:00:00Z",
                },
              },
            ],
          },
        ],
        ORG_ID
      );
      // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
      const updateSetCall = mockDb.update.mock.results[0]?.value as any;
      if (updateSetCall?.set?.mock?.calls?.[0]) {
        const setData = updateSetCall.set.mock.calls[0][0];
        expect(setData.organizationId).toBeUndefined();
        expect(setData.createdAt).toBeUndefined();
        expect(setData.name).toBe("New Name");
      }
    });

    it("yjs_documents PATCH strips immutable keys", async () => {
      mockSelectResult = [
        { orgId: ORG_ID, visibility: WORKSPACE_VISIBILITY.shared },
      ];
      await service.ingest(
        [
          {
            crud: [
              {
                op: "PATCH",
                type: "yjs_documents",
                id: "yd1",
                data: {
                  workspace_id: "other-workspace",
                },
              },
            ],
          },
        ],
        ORG_ID
      );
      // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
      const updateSetCall = mockDb.update.mock.results[0]?.value as any;
      if (updateSetCall?.set?.mock?.calls?.[0]) {
        const setData = updateSetCall.set.mock.calls[0][0];
        expect(setData.workspaceId).toBeUndefined();
      }
    });
  });

  describe("slug conflict retry", () => {
    it("PUT retries with suffix on wrapped slug unique violation", async () => {
      mockValues
        .mockImplementationOnce(() => {
          throw makeDrizzleUniqueError();
        })
        .mockImplementation(() => Promise.resolve(undefined));

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "p1",
                data: { name: "P", slug: "test", organization_id: ORG_ID },
              },
            ],
          },
        ],
        ORG_ID
      );

      expect(mockValues).toHaveBeenCalledTimes(2);
      expect(mockDb.transaction).toHaveBeenCalledTimes(3);
      // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
      const secondSlug = (mockValues.mock.calls[1][0] as any).slug;
      expect(secondSlug).toMatch(/^test-[0-9a-f]{4}$/);
    });

    it("PUT rejects on wrapped non-slug unique violation", async () => {
      mockValues.mockImplementation(() => {
        throw makeDrizzleUniqueError("workspaces_name_unique");
      });

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p1",
                  data: { name: "P", slug: "test", organization_id: ORG_ID },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow();

      expect(mockValues).toHaveBeenCalledTimes(1);
    });

    it("PUT rejects on non-unique-violation errors", async () => {
      mockValues.mockImplementation(() => {
        throw new Error("connection lost");
      });

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p1",
                  data: { name: "P", slug: "s", organization_id: ORG_ID },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("connection lost");

      expect(mockValues).toHaveBeenCalledTimes(1);
    });

    it("PATCH retries with suffix on wrapped slug unique violation", async () => {
      mockSelectResult = [{ id: "p1" }];
      mockWhere
        .mockImplementationOnce(() => {
          throw makeDrizzleUniqueError();
        })
        .mockImplementation(() => Promise.resolve(undefined));

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PATCH",
                type: "workspaces",
                id: "p1",
                data: { slug: "dup" },
              },
            ],
          },
        ],
        ORG_ID
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(3);
      // The where mock is called during both authorize (select) and patch attempts
      // At least 2 calls total: authorize + first attempt + retry
      expect(mockWhere.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("base64 transform", () => {
    it("decodes updateB64 to Buffer updateData for yjs_document_updates", async () => {
      mockSelectResultsQueue = [[], [{ id: "workspace-1" }]];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "yjs_document_updates",
                id: "u1",
                data: {
                  workspace_id: "workspace-1",
                  document_id: "doc-1",
                  update_b64: btoa("hello"),
                },
              },
            ],
          },
        ],
        ORG_ID,
        USER_ID
      );

      // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
      const inserted = mockValues.mock.calls[0][0] as any;
      expect(inserted.updateData).toBeInstanceOf(Buffer);
      expect(inserted.updateData.toString()).toBe("hello");
      expect(inserted.updateB64).toBeUndefined();
      expect(inserted.userId).toBe(USER_ID);
    });

    it("skips transform when no updateB64", async () => {
      mockSelectResultsQueue = [[], [{ id: "workspace-1" }]];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "yjs_document_updates",
                id: "u2",
                data: {
                  workspace_id: "workspace-1",
                  document_id: "doc-1",
                  update_data: "raw",
                },
              },
            ],
          },
        ],
        ORG_ID,
        USER_ID
      );

      // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
      const inserted = mockValues.mock.calls[0][0] as any;
      expect(inserted.updateData).toBe("raw");
      expect(inserted.updateB64).toBeUndefined();
      expect(inserted.userId).toBe(USER_ID);
    });

    it("overwrites spoofed client userId with authenticated user id", async () => {
      mockSelectResultsQueue = [[], [{ id: "workspace-1" }]];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "yjs_document_updates",
                id: "u3",
                data: {
                  workspace_id: "workspace-1",
                  document_id: "doc-1",
                  user_id: "spoofed-user",
                  update_b64: btoa("hello"),
                },
              },
            ],
          },
        ],
        ORG_ID,
        USER_ID
      );

      // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
      const inserted = mockValues.mock.calls[0][0] as any;
      expect(inserted.userId).toBe(USER_ID);
    });

    it("stores null userId for system-originated yjs updates", async () => {
      mockSelectResultsQueue = [[], [{ id: "workspace-1" }]];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "yjs_document_updates",
                id: "u4",
                data: {
                  workspace_id: "workspace-1",
                  document_id: "doc-1",
                  update_b64: btoa("hello"),
                },
              },
            ],
          },
        ],
        ORG_ID
      );

      // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
      const inserted = mockValues.mock.calls[0][0] as any;
      expect(inserted.userId).toBeNull();
    });
  });

  describe("multi-transaction ingest", () => {
    it("processes entries across multiple transactions", async () => {
      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "p1",
                data: { name: "A", slug: "a", organization_id: ORG_ID },
              },
            ],
          },
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "p2",
                data: { name: "B", slug: "b", organization_id: ORG_ID },
              },
            ],
          },
        ],
        ORG_ID
      );

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it("processes multiple entries in a single transaction batch", async () => {
      mockSelectResultsQueue = [[], [{ id: "p1" }]];

      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "p1",
                data: { name: "A", slug: "a", organization_id: ORG_ID },
              },
              { op: "DELETE", type: "workspaces", id: "p1" },
            ],
          },
        ],
        ORG_ID
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("aborts remaining entries after error in the same client transaction", async () => {
      mockValues
        .mockImplementationOnce(() => {
          throw new Error("db crashed");
        })
        .mockImplementation(() => Promise.resolve(undefined));

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p1",
                  data: { name: "A", slug: "a", organization_id: ORG_ID },
                },
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p2",
                  data: { name: "B", slug: "b", organization_id: ORG_ID },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("db crashed");

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it("aborts later client transactions after the first failure", async () => {
      mockValues
        .mockImplementationOnce(() => {
          throw new Error("db crashed");
        })
        .mockImplementation(() => Promise.resolve(undefined));

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p1",
                  data: { name: "A", slug: "a", organization_id: ORG_ID },
                },
              ],
            },
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p2",
                  data: { name: "B", slug: "b", organization_id: ORG_ID },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("db crashed");

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it("rolls back earlier writes from the same client transaction on failure", async () => {
      const committedIds: string[] = [];
      const createTx = (stagedIds: string[]) => {
        const txValues = mock((...args: unknown[]) => {
          const data = args[0] as { id: string };
          stagedIds.push(data.id);
          if (data.id === "p2") {
            throw new Error("db crashed");
          }
          return Promise.resolve(undefined);
        });
        const tx = {
          ...mockDb,
          insert: mock(() => ({ values: txValues })),
        } as typeof mockDb;

        tx.transaction = mock(async (nestedCallback) => {
          const savepointIds = [...stagedIds];
          const nestedTx = createTx(savepointIds);
          await nestedCallback(nestedTx);
          stagedIds.splice(0, stagedIds.length, ...savepointIds);
        });

        return tx;
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const stagedIds: string[] = [];
        const tx = createTx(stagedIds);
        await callback(tx);
        committedIds.push(...stagedIds);
      });

      await expect(
        service.ingest(
          [
            {
              crud: [
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p1",
                  data: { name: "A", slug: "a", organization_id: ORG_ID },
                },
                {
                  op: "PUT",
                  type: "workspaces",
                  id: "p2",
                  data: { name: "B", slug: "b", organization_id: ORG_ID },
                },
              ],
            },
          ],
          ORG_ID
        )
      ).rejects.toThrow("db crashed");

      expect(committedIds).toEqual([]);
    });

    it("runs each client transaction and workspace write inside db.transaction", async () => {
      await service.ingest(
        [
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "p1",
                data: { name: "A", slug: "a", organization_id: ORG_ID },
              },
            ],
          },
          {
            crud: [
              {
                op: "PUT",
                type: "workspaces",
                id: "p2",
                data: { name: "B", slug: "b", organization_id: ORG_ID },
              },
            ],
          },
        ],
        ORG_ID
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(4);
    });
  });

  describe("getCredentials", () => {
    const userId = "user-123";
    const organizationId = "org-456";

    beforeEach(() => {
      process.env.POWERSYNC_URL = "http://localhost:8080";
    });

    it("should return token and expiresAt", async () => {
      mockSignJWT.mockResolvedValue({ token: "jwt-token-abc" });

      const result = await service.getCredentials(
        userId,
        organizationId,
        "cloud"
      );

      expect(result.token).toBe("jwt-token-abc");
      expect(typeof result.expiresAt).toBe("number");
    });

    it("should call signJWT with correct payload including organization_id", async () => {
      mockSignJWT.mockResolvedValue({ token: "jwt-token-abc" });
      const before = Math.floor(Date.now() / 1000);

      await service.getCredentials(userId, organizationId, "cloud");

      expect(mockSignJWT).toHaveBeenCalledWith({
        body: {
          payload: {
            sub: userId,
            aud: "http://localhost:8080",
            iat: expect.any(Number),
            organization_id: organizationId,
            sync_access: "cloud",
          },
          overrideOptions: {
            jwt: { expirationTime: "5m" },
          },
        },
      });

      const iat = (mockSignJWT.mock.calls[0][0] as any).body.payload.iat;
      expect(iat).toBeGreaterThanOrEqual(before);
      expect(iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    });

    it("should set expiresAt to 4 minutes from now (60s slack before JWT expiry)", async () => {
      mockSignJWT.mockResolvedValue({ token: "t" });

      const result = await service.getCredentials(
        userId,
        organizationId,
        "cloud"
      );
      const now = Math.floor(Date.now() / 1000);

      // JWT actually expires at now+300s ("5m"); we report expiresAt=now+240s
      // so the PowerSync SDK calls fetchCredentials again before the token
      // dies. Narrow revocation window, acceptable client overhead.
      expect(result.expiresAt).toBeGreaterThanOrEqual(now + 239);
      expect(result.expiresAt).toBeLessThanOrEqual(now + 240);
    });

  });
});
