import type { PropertyDefinition } from "./types";

export const KANBAN_PLUGIN_ID = "lunaris.kanban";
export const KANBAN_TASK_RESOURCE_TYPE_ID = "lunaris.kanban.task";
export const UNASSIGNED_COLUMN_ID = "__unassigned";
export const KANBAN_META_MAP = "kanbanMeta";
export const PROPERTIES_INITIALIZED_KEY = "propertiesInitialized";

export const LABEL_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
] as const;

export const DEFAULT_STATUS_PROPERTY: PropertyDefinition = {
  id: "status",
  name: "Status",
  type: "select",
  options: [
    { id: "backlog", name: "Backlog", color: LABEL_COLORS[8] },
    { id: "todo", name: "To Do", color: LABEL_COLORS[5] },
    { id: "in-progress", name: "In Progress", color: LABEL_COLORS[1] },
    { id: "done", name: "Done", color: LABEL_COLORS[3] },
    { id: "canceled", name: "Canceled", color: LABEL_COLORS[0] },
  ],
};
