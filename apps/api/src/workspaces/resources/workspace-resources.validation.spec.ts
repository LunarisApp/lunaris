import { describe, expect, it, mock } from "bun:test";
import { NotFoundException } from "@nestjs/common";
import {
  assertValidWorkspaceResourceParent,
} from "./workspace-resources.validation";

function databaseReturning(rows: unknown[]) {
  return {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve(rows)),
      })),
    })),
  };
}

describe("assertValidWorkspaceResourceParent", () => {
  it.each([
    ["missing", []],
    [
      "another workspace",
      [{ id: "parent_1", parentId: null, workspaceId: "workspace_2" }],
    ],
  ])("hides %s parents behind the same 404", async (_case, rows) => {
    const error = await assertValidWorkspaceResourceParent({
      resourceId: "item_1",
      parentId: "parent_1",
      workspaceId: "workspace_1",
      tx: databaseReturning(rows) as never,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toEqual(
      expect.objectContaining({
        message: "Workspace resource parent not found",
        status: 404,
      }),
    );
  });
});
