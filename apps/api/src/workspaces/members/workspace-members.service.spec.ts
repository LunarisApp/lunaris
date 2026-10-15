import { describe, expect, it, mock } from "bun:test";
import { NotFoundException } from "@nestjs/common";
import {
  WORKSPACE_ROLE,
  WORKSPACE_VISIBILITY,
} from "@repo/auth/sync-access";
import { WorkspaceMembersService } from "./workspace-members.service";

const now = new Date("2026-07-30T12:00:00.000Z");

function createDatabase(selectRows: unknown[][]) {
  const forUpdate = mock(() => ({
    limit: mock(() => Promise.resolve(selectRows.shift() ?? [])),
  }));
  const select = mock(() => {
    const query = {
      for: forUpdate,
      limit: mock(() => Promise.resolve(selectRows.shift() ?? [])),
      orderBy: mock(() => Promise.resolve(selectRows.shift() ?? [])),
    };
    const chain = {
      innerJoin: mock(() => chain),
      where: mock(() => query),
    };
    return { from: mock(() => chain) };
  });
  const insert = mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ id: "pmem_1" }])),
    })),
  }));
  const tx = {
    insert,
    select,
  };
  const transaction = mock(
    async (operation: (database: typeof tx) => Promise<unknown>) =>
      operation(tx),
  );

  return {
    database: { db: { ...tx, transaction } } as never,
    forUpdate,
    insert,
    select,
    transaction,
  };
}

describe("WorkspaceMembersService", () => {
  it("does not disclose member details to non-owners", async () => {
    const { database, select } = createDatabase([[]]);
    const service = new WorkspaceMembersService(database);

    await expect(
      service.list("workspace_1", "org_1", "viewer_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("locks ownership before granting access", async () => {
    const { database, forUpdate, insert, transaction } = createDatabase([
      [{ id: "workspace_1", visibility: WORKSPACE_VISIBILITY.private }],
      [{ id: "member_2" }],
      [
        {
          createdAt: now,
          email: "member@example.com",
          id: "pmem_1",
          image: null,
          name: "Member",
          workspaceId: "workspace_1",
          role: WORKSPACE_ROLE.viewer,
          updatedAt: now,
          userId: "user_2",
        },
      ],
    ]);
    const service = new WorkspaceMembersService(database);

    await expect(
      service.add({
        organizationId: "org_1",
        ownerId: "owner_1",
        workspaceId: "workspace_1",
        role: WORKSPACE_ROLE.viewer,
        userId: "user_2",
      }),
    ).resolves.toMatchObject({
      id: "pmem_1",
      role: WORKSPACE_ROLE.viewer,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(forUpdate).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
