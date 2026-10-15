import { definePluginMcpCapabilities } from "@lunarisapp/plugin-sdk/mcp";
import * as z from "zod";
import {
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
} from "./constants";
import {
  kanbanCreateTaskInputSchema,
  kanbanCreateTaskOutputSchema,
  kanbanGetBoardPropertiesInputSchema,
  kanbanGetBoardPropertiesOutputSchema,
  kanbanUpdateTaskInputSchema,
  kanbanUpdateTaskOutputSchema,
} from "./mcp-contract";

const id = (description: string) => z.string().min(1).describe(description);
const organizationId = id("Exact organization ID.");
const workspaceId = id("Exact workspace ID containing the Kanban board.");
const boardId = id("Exact Kanban board resource ID.");
const idempotencyKey = z
  .string()
  .min(8)
  .max(200)
  .describe(
    "Stable unique key for this mutation. Reuse only when retrying the identical request."
  );
const pagination = {
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe("Opaque nextCursor from the previous page."),
  limit: z.number().int().min(1).max(100).default(50),
};
const placement = {
  position: z.number().int().optional(),
};

export const kanbanMcpCapabilities = definePluginMcpCapabilities({
  extensionId: KANBAN_PLUGIN_ID,
  tools: [
    {
      description:
        "List Kanban boards in one known workspace. Returns board resource metadata, not tasks or board document content.",
      execution: {
        input: {
          cursor: { from: "cursor" },
          limit: { from: "limit" },
          resourceTypeId: { value: KANBAN_PLUGIN_ID },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "list_resources",
      },
      inputSchema: z.object({ ...pagination, workspaceId, organizationId }),
      name: "kanban_list_boards",
    },
    {
      description:
        "Create a Kanban board in one known workspace. Reuse the idempotency key only when retrying the same board creation.",
      execution: {
        input: {
          resourceTypeId: { value: KANBAN_PLUGIN_ID },
          idempotencyKey: { from: "idempotencyKey" },
          name: { from: "name" },
          parentId: { from: "parentId" },
          schemaVersion: { value: 1 },
          storage: { value: { content: { kind: "yjs" } } },
          position: { from: "position" },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "create_resource",
      },
      inputSchema: z.object({
        idempotencyKey,
        name: z.string().trim().min(1).describe("Board name."),
        parentId: id("Parent workspace resource ID.")
          .nullable()
          .optional()
          .describe("Parent item ID, or null to create at workspace root."),
        ...placement,
        workspaceId,
        organizationId,
      }),
      name: "kanban_create_board",
    },
    {
      description:
        "Get the property definitions and allowed options for one known Kanban board. Returns effective defaults for a board that has not initialized its property document yet.",
      execution: {
        kind: "plugin",
        offlineAvailability: "supported",
        operation: "get_board_properties",
        risk: "read",
        scope: "workspace:read",
      },
      inputSchema: kanbanGetBoardPropertiesInputSchema,
      name: "kanban_get_board_properties",
      outputSchema: kanbanGetBoardPropertiesOutputSchema,
    },
    {
      description:
        "List direct tasks on one known Kanban board. Returns task resource metadata, not task document content.",
      execution: {
        input: {
          cursor: { from: "cursor" },
          limit: { from: "limit" },
          parentId: { from: "boardId" },
          resourceTypeId: { value: KANBAN_TASK_RESOURCE_TYPE_ID },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "list_resources",
      },
      inputSchema: z.object({
        boardId,
        ...pagination,
        workspaceId,
        organizationId,
      }),
      name: "kanban_list_tasks",
    },
    {
      description:
        "Create a task on one known Kanban board with optional typed properties. A Select assignment determines the task's column when the board is grouped by that property. Reuse the idempotency key only when retrying the same task creation.",
      execution: {
        kind: "plugin",
        offlineAvailability: "supported",
        operation: "create_task",
        risk: "write",
        scope: "workspace:write",
      },
      inputSchema: kanbanCreateTaskInputSchema,
      name: "kanban_create_task",
      outputSchema: kanbanCreateTaskOutputSchema,
    },
    {
      description:
        "Update a Kanban task name and/or typed properties. Select and Multi-select option IDs are preferred, but unique names are accepted. People require exact IDs from list_organization_members. Resource requires the exact reference fields returned by search_resources. Dates require YYYY-MM-DD or RFC 3339. Null clears a property. Name changes require expectedRevision.",
      execution: {
        kind: "plugin",
        offlineAvailability: "supported",
        operation: "update_task",
        risk: "write",
        scope: "workspace:write",
      },
      inputSchema: kanbanUpdateTaskInputSchema,
      name: "kanban_update_task",
      outputSchema: kanbanUpdateTaskOutputSchema,
    },
    {
      description:
        "Preview moving one known Kanban task to Trash. The returned previewToken is required by kanban_delete_task and expires quickly.",
      execution: {
        input: {
          expectedResourceTypeId: { value: KANBAN_TASK_RESOURCE_TYPE_ID },
          resourceId: { from: "taskId" },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "preview_delete_resource",
      },
      inputSchema: z.object({
        workspaceId,
        taskId: id("Exact Kanban task item ID."),
        organizationId,
      }),
      name: "kanban_preview_delete_task",
    },
    {
      description:
        "Move one Kanban task to Trash for 30 days using a fresh previewToken from kanban_preview_delete_task. Reuse the idempotency key only when retrying the identical operation.",
      execution: {
        input: {
          expectedResourceTypeId: { value: KANBAN_TASK_RESOURCE_TYPE_ID },
          idempotencyKey: { from: "idempotencyKey" },
          resourceId: { from: "taskId" },
          previewToken: { from: "previewToken" },
          workspaceId: { from: "workspaceId" },
          organizationId: { from: "organizationId" },
        },
        kind: "operation",
        operation: "delete_resource",
      },
      inputSchema: z.object({
        idempotencyKey,
        previewToken: id(
          "Fresh preview token returned by kanban_preview_delete_task.",
        ),
        workspaceId,
        taskId: id("Exact Kanban task item ID."),
        organizationId,
      }),
      name: "kanban_delete_task",
    },
  ],
});
