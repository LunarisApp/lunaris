import { describe, expect, it } from "vitest";
import { KANBAN_PLUGIN_ID, KANBAN_TASK_RESOURCE_TYPE_ID } from "./constants";
import { kanbanMcpCapabilities } from "./mcp";

describe("Kanban MCP capabilities", () => {
  it("owns namespaced board and task tools", () => {
    expect(kanbanMcpCapabilities.extensionId).toBe(KANBAN_PLUGIN_ID);
    expect(kanbanMcpCapabilities.tools.map(({ name }) => name)).toEqual([
      "kanban_list_boards",
      "kanban_create_board",
      "kanban_get_board_properties",
      "kanban_list_tasks",
      "kanban_create_task",
      "kanban_update_task",
      "kanban_preview_delete_task",
      "kanban_delete_task",
    ]);
  });

  it("declares a read-only board property getter", () => {
    const getter = kanbanMcpCapabilities.tools.find(
      ({ name }) => name === "kanban_get_board_properties"
    );

    expect(getter?.execution).toMatchObject({
      kind: "plugin",
      offlineAvailability: "supported",
      operation: "get_board_properties",
      risk: "read",
      scope: "workspace:read",
    });
  });

  it("fixes the board resource type", () => {
    const createBoard = kanbanMcpCapabilities.tools.find(
      ({ name }) => name === "kanban_create_board"
    );

    expect(createBoard?.execution.kind).toBe("operation");
    if (createBoard?.execution.kind !== "operation") {
      throw new Error("Expected delegated board creation");
    }
    expect(createBoard.execution.input).toMatchObject({
      resourceTypeId: { value: KANBAN_PLUGIN_ID },
      schemaVersion: { value: 1 },
    });
  });

  it("declares extension-owned task creation and updates", () => {
    const create = kanbanMcpCapabilities.tools.find(
      ({ name }) => name === "kanban_create_task"
    );
    const update = kanbanMcpCapabilities.tools.find(
      ({ name }) => name === "kanban_update_task"
    );
    expect(create?.execution).toMatchObject({
      kind: "plugin",
      offlineAvailability: "supported",
      operation: "create_task",
      risk: "write",
      scope: "workspace:write",
    });
    expect(update?.execution).toMatchObject({
      kind: "plugin",
      offlineAvailability: "supported",
      operation: "update_task",
      risk: "write",
      scope: "workspace:write",
    });
    expect(
      create?.inputSchema.safeParse({
        boardId: "board-1",
        idempotencyKey: "request-1",
        name: "Ship it",
        workspaceId: "workspace-1",
        properties: { Priority: "High" },
        organizationId: "organization-1",
      }).success
    ).toBe(true);
    expect(
      create?.inputSchema.safeParse({
        boardId: "board-1",
        idempotencyKey: "request-2",
        name: "Typed task",
        workspaceId: "workspace-1",
        properties: {
          Assignees: ["user-1", "user-2"],
          Blocked: false,
          Due: "2026-08-25",
          Document: {
            resourceId: "item-1",
            name: "Roadmap",
            resourceTypeId: "lunaris.rich-text",
            workspaceId: "workspace-1",
            workspaceName: "Launch",
          },
          Estimate: 3.5,
        },
        organizationId: "organization-1",
      }).success
    ).toBe(true);
    expect(
      create?.inputSchema.safeParse({
        boardId: "board-1",
        idempotencyKey: "request-3",
        name: "Invalid task",
        workspaceId: "workspace-1",
        properties: { Estimate: { value: 3 } },
        organizationId: "organization-1",
      }).success
    ).toBe(false);
    expect(
      create?.inputSchema.safeParse({
        boardId: "board-1",
        idempotencyKey: "request-4",
        name: "Invalid document",
        workspaceId: "workspace-1",
        properties: {
          Document: {
            documentId: "doc-1",
            resourceId: "item-1",
            name: "Roadmap",
            resourceTypeId: "lunaris.rich-text",
            workspaceId: "workspace-1",
            workspaceName: "Launch",
            unexpected: true,
          },
        },
        organizationId: "organization-1",
      }).success
    ).toBe(false);
    expect(
      create?.inputSchema.safeParse({
        boardId: "board-1",
        idempotencyKey: "request-5",
        name: "Folder is not a document",
        workspaceId: "workspace-1",
        properties: {
          Document: {
            documentId: null,
            resourceId: "folder-1",
            name: "Planning",
            resourceTypeId: null,
            workspaceId: "workspace-1",
            workspaceName: "Launch",
          },
        },
        organizationId: "organization-1",
      }).success
    ).toBe(false);
  });

  it("binds task deletion to the task resource type", () => {
    expect(
      kanbanMcpCapabilities.tools
        .filter(({ name }) => name.includes("delete_task"))
        .map(({ name }) => name)
    ).toEqual(["kanban_preview_delete_task", "kanban_delete_task"]);
    for (const tool of kanbanMcpCapabilities.tools.filter(({ name }) =>
      name.includes("delete_task")
    )) {
      if (tool.execution.kind !== "operation") {
        throw new Error("Expected delegated deletion tool");
      }
      expect(tool.execution.input).toMatchObject({
        expectedResourceTypeId: { value: KANBAN_TASK_RESOURCE_TYPE_ID },
      });
    }
  });
});
