import { describe, expect, it } from "bun:test";
import {
  agentMcpToolNames,
  builtInPluginMcpTools,
  isBuiltInPluginMcpOperationTool,
  pluginMcpWire,
  resolvePluginMcpInput,
} from "./extension-mcp";
import { serializeAgentWire } from "./wire";

describe("built-in extension MCP registry", () => {
  it("registers built-in extension tools without core name collisions", () => {
    expect(new Set(agentMcpToolNames).size).toBe(agentMcpToolNames.length);
    expect(
      builtInPluginMcpTools.map(({ name, pluginId }) => ({ name, pluginId }))
    ).toEqual([
      { name: "kanban_list_boards", pluginId: "lunaris.kanban" },
      { name: "kanban_create_board", pluginId: "lunaris.kanban" },
      {
        name: "kanban_get_board_properties",
        pluginId: "lunaris.kanban",
      },
      { name: "kanban_list_tasks", pluginId: "lunaris.kanban" },
      { name: "kanban_create_task", pluginId: "lunaris.kanban" },
      { name: "kanban_update_task", pluginId: "lunaris.kanban" },
      {
        name: "kanban_preview_delete_task",
        pluginId: "lunaris.kanban",
      },
      { name: "kanban_delete_task", pluginId: "lunaris.kanban" },
      { name: "rich_text_read_me", pluginId: "lunaris.rich-text" },
      {
        name: "rich_text_list_documents",
        pluginId: "lunaris.rich-text",
      },
      {
        name: "rich_text_create_document",
        pluginId: "lunaris.rich-text",
      },
      {
        name: "rich_text_get_document",
        pluginId: "lunaris.rich-text",
      },
      {
        name: "rich_text_update_document",
        pluginId: "lunaris.rich-text",
      },
      {
        name: "rich_text_preview_delete_document",
        pluginId: "lunaris.rich-text",
      },
      {
        name: "rich_text_delete_document",
        pluginId: "lunaris.rich-text",
      },
    ]);
  });

  it("serializes read-only plugin procedures as GET queries", () => {
    const tool = requiredTool("kanban_get_board_properties");
    expect(
      serializeAgentWire(pluginMcpWire(tool), {
        boardId: "board-1",
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      })
    ).toEqual({
      body: undefined,
      headers: {},
      method: "GET",
      path: "/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/get_board_properties",
      query: { boardId: "board-1" },
    });
  });

  it("serializes extension-owned task creation with properties", () => {
    const tool = requiredTool("kanban_create_task");
    if (isBuiltInPluginMcpOperationTool(tool)) {
      throw new Error("Expected extension-owned task creation");
    }
    expect(
      serializeAgentWire(pluginMcpWire(tool), {
        boardId: "board-1",
        idempotencyKey: "request-1",
        name: "Ship it",
        workspaceId: "workspace-1",
        properties: { Priority: "High" },
        organizationId: "organization-1",
      })
    ).toEqual({
      body: {
        boardId: "board-1",
        name: "Ship it",
        properties: { Priority: "High" },
      },
      headers: { "Idempotency-Key": "request-1" },
      method: "POST",
      path: "/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/create_task",
      query: {},
    });
  });

  it("binds Kanban deletion to the task resource type", () => {
    const tool = requiredTool("kanban_delete_task");
    if (!isBuiltInPluginMcpOperationTool(tool)) {
      throw new Error("Expected delegated task deletion");
    }

    expect(
      resolvePluginMcpInput(tool, {
        idempotencyKey: "request-1",
        previewToken: "preview-1",
        workspaceId: "workspace-1",
        taskId: "task-1",
        organizationId: "organization-1",
      })
    ).toMatchObject({
      expectedResourceTypeId: "lunaris.kanban.task",
      resourceId: "task-1",
    });
  });

  it("serializes plugin mappings into the shared HTTP transport", () => {
    const tool = requiredTool("kanban_list_tasks");
    expect(
      serializeAgentWire(pluginMcpWire(tool), {
        boardId: "board-1",
        limit: 25,
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      })
    ).toMatchObject({
      method: "GET",
      path: "/v1/organizations/organization-1/workspaces/workspace-1/resources",
      query: {
        limit: 25,
        parentId: "board-1",
        resourceTypeId: "lunaris.kanban.task",
      },
    });
  });

  it("serializes extension-owned procedures through the generic host route", () => {
    const tool = requiredTool("kanban_update_task");
    expect(
      serializeAgentWire(pluginMcpWire(tool), {
        boardId: "board-1",
        expectedRevision: "revision-1",
        idempotencyKey: "request-1",
        name: "Ship it",
        workspaceId: "workspace-1",
        properties: { Priority: "High" },
        taskId: "task-1",
        organizationId: "organization-1",
      })
    ).toEqual({
      body: {
        boardId: "board-1",
        name: "Ship it",
        properties: { Priority: "High" },
        taskId: "task-1",
      },
      headers: {
        "Idempotency-Key": "request-1",
        "If-Match": '"revision-1"',
      },
      method: "POST",
      path: "/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/update_task",
      query: {},
    });
  });

  it("sends Rich Text blocks in a revision-guarded request body", () => {
    const tool = requiredTool("rich_text_update_document");
    expect(
      serializeAgentWire(pluginMcpWire(tool), {
        blocks: [{ id: "title", type: "heading", content: "Title" }],
        documentResourceId: "item-1",
        expectedRevision: "revision-1",
        idempotencyKey: "request-1",
        workspaceId: "workspace-1",
        organizationId: "organization-1",
      })
    ).toEqual({
      body: {
        blocks: [{ id: "title", type: "heading", content: "Title" }],
        documentResourceId: "item-1",
      },
      headers: {
        "Idempotency-Key": "request-1",
        "If-Match": '"revision-1"',
      },
      method: "POST",
      path: "/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.rich-text/operations/update_document",
      query: {},
    });
  });
});

function requiredTool(name: string) {
  const tool = builtInPluginMcpTools.find(
    (candidate) => candidate.name === name
  );
  if (!tool) {
    throw new Error(`Missing test tool: ${name}`);
  }
  return tool;
}
