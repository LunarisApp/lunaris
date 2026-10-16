import type { Doc, Map as YMap } from "yjs";
import { DEFAULT_STATUS_PROPERTY } from "./constants";
import type { KanbanPropertyValue, KanbanTaskProperties } from "./mcp-contract";
import {
  canonicalPropertyDate,
  hasPropertyValue,
  isResourcePropertyValue,
  isPropertyDate,
} from "./property-codec";
import {
  appendPropertyDefinition,
  arePropertiesInitialized,
  getEffectivePropertyDefinitions,
  markPropertiesInitialized,
} from "./property-state";
import {
  getTaskAssignments,
  getTaskPropertyValue,
  setTaskPropertyValue,
} from "./task-assignments";
import type { PropertyDefinition, PropertyValue } from "./types";

export class KanbanMcpInputError extends Error {
  readonly code = "INVALID_KANBAN_TASK_UPDATE";
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "KanbanMcpInputError";
  }
}

export function getKanbanBoardProperties(doc: Doc): PropertyDefinition[] {
  return getEffectivePropertyDefinitions(doc).map((property) => ({
    ...property,
    ...(property.type === "select" || property.type === "multi-select"
      ? { options: property.options.map((option) => ({ ...option })) }
      : {}),
  }));
}

export function updateKanbanTaskProperties(
  doc: Doc,
  taskId: string,
  requested: KanbanTaskProperties | undefined,
  options: { allowedPersonIds?: ReadonlySet<string> } = {}
): Record<string, PropertyValue> {
  const properties = doc.getArray<YMap<unknown>>("properties");
  if (
    properties.length === 0 &&
    !arePropertiesInitialized(doc) &&
    requested &&
    Object.keys(requested).length > 0
  ) {
    appendPropertyDefinition(properties, DEFAULT_STATUS_PROPERTY);
    markPropertiesInitialized(doc);
  }

  const definitions = getKanbanBoardProperties(doc);
  const assignments = getTaskAssignments(doc);
  for (const [propertyKey, requestedValue] of Object.entries(requested ?? {})) {
    const property = resolveUnique(definitions, propertyKey, "property");
    if (requestedValue === null) {
      setTaskPropertyValue(doc, taskId, property.id, null);
      continue;
    }
    setTaskPropertyValue(
      doc,
      taskId,
      property.id,
      resolvePropertyValue(
        property,
        requestedValue,
        options,
        getTaskPropertyValue(assignments.get(taskId), property)
      )
    );
  }

  const assignment = assignments.get(taskId);
  if (assignment?.size === 0) {
    assignments.delete(taskId);
  }

  return Object.fromEntries(
    definitions.flatMap((property) => {
      const value = getTaskPropertyValue(assignment, property);
      return hasPropertyValue(value)
        ? [[property.id, value as PropertyValue] as const]
        : [];
    })
  );
}

export function kanbanTaskPropertiesIncludePeople(
  doc: Doc,
  requested: KanbanTaskProperties | undefined
): boolean {
  const keys = Object.keys(requested ?? {}).map((key) =>
    key.toLocaleLowerCase()
  );
  return getKanbanBoardProperties(doc).some(
    (property) =>
      property.type === "people" &&
      (keys.includes(property.id.toLocaleLowerCase()) ||
        keys.includes(property.name.toLocaleLowerCase()))
  );
}

function resolvePropertyValue(
  property: PropertyDefinition,
  value: KanbanPropertyValue,
  options: { allowedPersonIds?: ReadonlySet<string> },
  currentValue: PropertyValue | undefined
): PropertyValue {
  switch (property.type) {
    case "select":
      if (typeof value !== "string" || !value) {
        invalidValue(property, "Select option");
      }
      return resolveUnique(property.options, value, "option").id;
    case "multi-select":
      if (!Array.isArray(value)) {
        invalidValue(property, "array of options");
      }
      return [
        ...new Set(
          value.map((key) => resolveUnique(property.options, key, "option").id)
        ),
      ];
    case "people": {
      if (!Array.isArray(value)) {
        invalidValue(property, "array of organization member IDs");
      }
      const ids = [...new Set(value)];
      const existingIds = new Set(
        Array.isArray(currentValue) ? currentValue : []
      );
      if (
        options.allowedPersonIds &&
        ids.some(
          (id) => !(options.allowedPersonIds?.has(id) || existingIds.has(id))
        )
      ) {
        throw new KanbanMcpInputError(
          `Unknown organization member ID for Kanban property ${property.name}`
        );
      }
      return ids;
    }
    case "resource":
      if (!isResourcePropertyValue(value)) {
        invalidValue(
          property,
          "resource reference with resourceId, name, resourceTypeId, workspaceId, and workspaceName"
        );
      }
      return value;
    case "date":
      if (typeof value !== "string" || !isPropertyDate(value)) {
        invalidValue(property, "YYYY-MM-DD or RFC 3339 date");
      }
      return canonicalPropertyDate(value);
    case "text":
      if (typeof value !== "string" || !value) {
        invalidValue(property, "non-empty text");
      }
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        invalidValue(property, "finite number");
      }
      return value;
    case "checkbox":
      if (typeof value !== "boolean") {
        invalidValue(property, "boolean");
      }
      return value;
  }
}

function invalidValue(property: PropertyDefinition, expected: string): never {
  throw new KanbanMcpInputError(
    `Kanban property ${property.name} requires ${expected}`
  );
}

function resolveUnique<T extends { id: string; name: string }>(
  values: readonly T[],
  key: string,
  label: "option" | "property"
): T {
  const exactId = values.find(({ id }) => id === key);
  if (exactId) {
    return exactId;
  }
  const matches = values.filter(
    ({ name }) => name.toLocaleLowerCase() === key.toLocaleLowerCase()
  );
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new KanbanMcpInputError(`Ambiguous Kanban ${label} name: ${key}`);
  }
  throw new KanbanMcpInputError(`Unknown Kanban ${label}: ${key}`);
}
