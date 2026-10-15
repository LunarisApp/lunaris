import * as z from "zod";

export const kanbanPropertyOptionSchema = z.object({
  color: z.string(),
  id: z.string(),
  name: z.string(),
});

const kanbanPropertyDefinitionBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const kanbanChoicePropertyDefinitionSchema =
  kanbanPropertyDefinitionBaseSchema.extend({
  options: z.array(kanbanPropertyOptionSchema),
  type: z.enum(["select", "multi-select"]),
});

const kanbanScalarPropertyDefinitionSchema =
  kanbanPropertyDefinitionBaseSchema.extend({
  type: z.enum(["people", "resource", "date", "text", "number", "checkbox"]),
});

export const kanbanPropertyDefinitionSchema = z.union([
  kanbanChoicePropertyDefinitionSchema,
  kanbanScalarPropertyDefinitionSchema,
]);

export const kanbanGetBoardPropertiesOperationInputSchema = z.object({
  boardId: z.string().min(1).describe("Exact Kanban board resource ID."),
});

export const kanbanGetBoardPropertiesInputSchema =
  kanbanGetBoardPropertiesOperationInputSchema.extend({
    workspaceId: z
      .string()
      .min(1)
      .describe("Exact workspace ID containing the board."),
    organizationId: z.string().min(1).describe("Exact organization ID."),
  });

export const kanbanGetBoardPropertiesOutputSchema = z.object({
  boardId: z.string(),
  properties: z.array(kanbanPropertyDefinitionSchema),
});

const kanbanResourcePropertyValueBaseShape = {
  resourceId: z.string().min(1),
  name: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string(),
};

export const kanbanResourcePropertyValueSchema = z.object({
  ...kanbanResourcePropertyValueBaseShape,
  resourceTypeId: z.string().min(1),
}).strict();

export const kanbanPropertyValueSchema = z.union([
  z.string(),
  z.array(z.string().min(1)),
  z.number().finite(),
  z.boolean(),
  kanbanResourcePropertyValueSchema,
]);

export const kanbanTaskPropertiesSchema = z
  .record(
    z.string().min(1),
    kanbanPropertyValueSchema.nullable(),
  )
  .describe(
    "Task property assignments. Keys may be exact property IDs or names. Select values use an option ID or unique name; Multi-select values use arrays of option IDs or names; People values use arrays of exact organization member IDs; Resource values use the exact resourceId, name, resourceTypeId, workspaceId, and workspaceName returned by resource search; Date values use YYYY-MM-DD or RFC 3339; Text, Number, and Checkbox use their matching primitive. Null clears an assignment. Use kanban_get_board_properties to discover definitions, list_organization_members to discover People IDs, and search_resources to discover resources.",
  );

export const kanbanCreateTaskOperationInputSchema = z.object({
  boardId: z.string().min(1).describe("Exact Kanban board resource ID."),
  name: z.string().trim().min(1).describe("Task name."),
  position: z.number().int().optional(),
  properties: kanbanTaskPropertiesSchema.optional(),
});

export const kanbanCreateTaskInputSchema =
  kanbanCreateTaskOperationInputSchema.extend({
    idempotencyKey: z
      .string()
      .min(8)
      .max(200)
      .describe(
        "Stable unique key for this mutation. Reuse only when retrying the identical request.",
      ),
    workspaceId: z
      .string()
      .min(1)
      .describe("Exact workspace ID containing the board."),
    organizationId: z.string().min(1).describe("Exact organization ID."),
  });

export const kanbanCreateTaskOutputSchema = z.object({
  boardId: z.string(),
  name: z.string(),
  position: z.number().int(),
  properties: z.record(z.string(), kanbanPropertyValueSchema),
  taskId: z.string(),
  updatedAt: z.string(),
});

export const kanbanUpdateTaskOperationInputSchema = z.object({
  boardId: z.string().min(1).describe("Exact Kanban board resource ID."),
  expectedRevision: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Task updatedAt revision from a prior read. Required when changing the task name.",
    ),
  name: z.string().trim().min(1).optional().describe("New task name."),
  properties: kanbanTaskPropertiesSchema.optional(),
  taskId: z.string().min(1).describe("Exact Kanban task item ID."),
});

export const kanbanUpdateTaskInputSchema =
  kanbanUpdateTaskOperationInputSchema.extend({
    idempotencyKey: z
      .string()
      .min(8)
      .max(200)
      .describe(
        "Stable unique key for this mutation. Reuse only when retrying the identical request.",
      ),
    workspaceId: z
      .string()
      .min(1)
      .describe("Exact workspace ID containing the board."),
    organizationId: z.string().min(1).describe("Exact organization ID."),
  });

export const kanbanUpdateTaskOutputSchema = z.object({
  boardId: z.string(),
  name: z.string(),
  properties: z.record(z.string(), kanbanPropertyValueSchema),
  taskId: z.string(),
  updatedAt: z.string(),
});

export type KanbanUpdateTaskInput = z.output<
  typeof kanbanUpdateTaskInputSchema
>;
export type KanbanUpdateTaskOutput = z.output<
  typeof kanbanUpdateTaskOutputSchema
>;
export type KanbanCreateTaskOutput = z.output<
  typeof kanbanCreateTaskOutputSchema
>;
export type KanbanGetBoardPropertiesOutput = z.output<
  typeof kanbanGetBoardPropertiesOutputSchema
>;
export type KanbanTaskProperties = z.output<
  typeof kanbanTaskPropertiesSchema
>;
export type KanbanPropertyValue = z.output<typeof kanbanPropertyValueSchema>;
