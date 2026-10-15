import {
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { NotFoundException } from "@nestjs/common";
import { BuiltInPluginControlController } from "./plugin-operations.controller";

function controller() {
  const execute = mock(() =>
    Promise.resolve({ boardId: "board-1", properties: [] }),
  );
  const value = new BuiltInPluginControlController(
    {
      requireOrganizationId: mock(() =>
        Promise.resolve({ userId: "user-1" }),
      ),
    } as never,
    { execute } as never,
    {} as never,
  );
  return { execute, value };
}

const request = {
  agentPrincipal: {
    actorId: "user-1",
    clientId: "client-1",
    kind: "oauth",
    scopes: ["workspace:read"],
    organizationIds: null,
  },
} as never;

describe("BuiltInPluginControlController", () => {
  it("executes read-only procedures through GET", async () => {
    const { execute, value } = controller();

    await expect(
      value.getPluginOperation(
        request,
        {} as never,
        "organization-1",
        "workspace-1",
        "lunaris.kanban",
        "get_board_properties",
        { boardId: "board-1" },
      ),
    ).resolves.toEqual({ boardId: "board-1", properties: [] });
    expect(execute).toHaveBeenCalledWith({
      actorId: "user-1",
      input: { boardId: "board-1" },
      operation: "get_board_properties",
      pluginId: "lunaris.kanban",
      workspaceId: "workspace-1",
      organizationId: "organization-1",
    });
  });

  it("does not execute mutations through the read route", async () => {
    const { execute, value } = controller();

    await expect(
      value.getPluginOperation(
        request,
        {} as never,
        "organization-1",
        "workspace-1",
        "lunaris.kanban",
        "update_task",
        { boardId: "board-1" },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(execute).not.toHaveBeenCalled();
  });
});
