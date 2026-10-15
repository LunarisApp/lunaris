import { describe, expect, it, mock } from "bun:test";
import { ConflictException } from "@nestjs/common";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { WorkspacesService, toWorkspaceDto } from "./workspaces.service";

const now = new Date("2026-07-21T12:00:00.000Z");

function workspaceRow() {
  return {
    createdAt: now,
    id: "workspace_1",
    name: "Workspace",
    organizationId: "org_1",
    ownerId: null,
    slug: "workspace",
    syncedCreatedAt: now,
    syncedUpdatedAt: now,
    updatedAt: now,
    lastActivityAt: null,
    visibility: WORKSPACE_VISIBILITY.shared,
  };
}

function selectRows(rows: unknown[]) {
  return mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve(rows)),
      })),
    })),
  }));
}

function uniqueSlugError() {
  return Object.assign(new Error("duplicate"), {
    cause: {
      code: "23505",
      constraint: "workspaces_org_slug_unique",
    },
  });
}

describe("WorkspacesService", () => {
  it("creates shared workspaces with server-owned fields", async () => {
    const values = mock(() => ({
      returning: mock(() => Promise.resolve([workspaceRow()])),
    }));
    const service = new WorkspacesService({
      db: { insert: mock(() => ({ values })) },
    } as never);

    const result = await service.create(
      { name: "Workspace", slug: "workspace" },
      "org_1",
      "user_1",
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Workspace",
        organizationId: "org_1",
        ownerId: null,
        slug: "workspace",
        visibility: WORKSPACE_VISIBILITY.shared,
      }),
    );
    expect(result).toEqual(toWorkspaceDto(workspaceRow()));
    expect(result).not.toHaveProperty("syncedUpdatedAt");
  });

  it("maps organization slug conflicts to 409", async () => {
    const service = new WorkspacesService({
      db: {
        insert: mock(() => ({
          values: mock(() => {
            throw uniqueSlugError();
          }),
        })),
        select: selectRows([{ id: "visible-workspace" }]),
      },
    } as never);

    await expect(
      service.create({ name: "Workspace", slug: "workspace" }, "org_1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not disclose inaccessible workspace slugs", async () => {
    let attempts = 0;
    const values = mock((value: { slug: string }) => {
      attempts += 1;
      if (attempts === 1) throw uniqueSlugError();
      return {
        returning: mock(() =>
          Promise.resolve([{ ...workspaceRow(), slug: value.slug }]),
        ),
      };
    });
    const service = new WorkspacesService({
      db: {
        insert: mock(() => ({ values })),
        select: selectRows([]),
      },
    } as never);

    const result = await service.create(
      { name: "Workspace", slug: "hidden-workspace" },
      "org_1",
      "user_1",
    );

    expect(result.slug).toMatch(/^hidden-workspace-[a-f0-9]{4}$/);
    expect(values).toHaveBeenCalledTimes(2);
  });

  it("creates private workspaces owned by the current user", async () => {
    const privateWorkspace = {
      ...workspaceRow(),
      ownerId: "user_1",
      visibility: WORKSPACE_VISIBILITY.private,
    };
    const values = mock(() => ({
      returning: mock(() => Promise.resolve([privateWorkspace])),
    }));
    const service = new WorkspacesService({
      db: { insert: mock(() => ({ values })) },
    } as never);

    const result = await service.create(
      {
        name: "Private Workspace",
        slug: "private-workspace",
        visibility: WORKSPACE_VISIBILITY.private,
      },
      "org_1",
      "user_1",
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user_1",
        visibility: WORKSPACE_VISIBILITY.private,
      }),
    );
    expect(result.visibility).toBe(WORKSPACE_VISIBILITY.private);
  });

  it("returns DESKTOP_ONLY for local cloud workspaces", async () => {
    const service = new WorkspacesService({ db: {} } as never);

    await expect(
      service.create(
        {
          name: "Local",
          slug: "local",
          visibility: WORKSPACE_VISIBILITY.local,
        },
        "org_1",
      ),
    ).rejects.toMatchObject({
      response: {
        code: "DESKTOP_ONLY",
      },
      status: 422,
    });
  });

  it("makes a shared workspace private and assigns the current user as owner", async () => {
    const privateWorkspace = {
      ...workspaceRow(),
      ownerId: "user_1",
      visibility: WORKSPACE_VISIBILITY.private,
    };
    const set = mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([privateWorkspace])),
      })),
    }));
    const tx = { update: mock(() => ({ set })) };
    const service = new WorkspacesService({
      db: {
        transaction: mock(
          (operation: (transaction: typeof tx) => unknown) => operation(tx),
        ),
      },
    } as never);

    const result = await service.update(
      "workspace_1",
      { visibility: WORKSPACE_VISIBILITY.private },
      "org_1",
      undefined,
      "user_1",
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user_1",
        visibility: WORKSPACE_VISIBILITY.private,
      }),
    );
    expect(result.visibility).toBe(WORKSPACE_VISIBILITY.private);
  });

  it("removes private members when making a workspace shared", async () => {
    const sharedWorkspace = workspaceRow();
    const set = mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([sharedWorkspace])),
      })),
    }));
    const deleteWhere = mock(() => Promise.resolve());
    const tx = {
      delete: mock(() => ({ where: deleteWhere })),
      update: mock(() => ({ set })),
    };
    const service = new WorkspacesService({
      db: {
        transaction: mock(
          (operation: (transaction: typeof tx) => unknown) => operation(tx),
        ),
      },
    } as never);

    const result = await service.update(
      "workspace_1",
      { visibility: WORKSPACE_VISIBILITY.shared },
      "org_1",
      undefined,
      "user_1",
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: null,
        visibility: WORKSPACE_VISIBILITY.shared,
      }),
    );
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(result.visibility).toBe(WORKSPACE_VISIBILITY.shared);
  });
});
