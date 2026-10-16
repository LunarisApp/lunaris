import type { Doc, Map as YMap } from "yjs";
import { Map as YjsMap } from "yjs";
import { hasPropertyValue, normalizePropertyValue } from "./property-codec";
import type { PropertyDefinition, PropertyValue } from "./types";

const TASK_ASSIGNMENTS_MAP = "taskAssignments";
const PROPERTY_ASSIGNMENT_PREFIX = "prop_";

export function getPropertyAssignmentKey(propertyId: string) {
  return `${PROPERTY_ASSIGNMENT_PREFIX}${propertyId}`;
}

export function getPropertyIdFromAssignmentKey(assignmentKey: string) {
  return assignmentKey.startsWith(PROPERTY_ASSIGNMENT_PREFIX)
    ? assignmentKey.slice(PROPERTY_ASSIGNMENT_PREFIX.length)
    : null;
}

export function getTaskAssignments(yDoc: Doc) {
  return yDoc.getMap<YMap<unknown>>(TASK_ASSIGNMENTS_MAP);
}

export function getOrCreateTaskAssignment(yDoc: Doc, taskId: string) {
  const assignments = getTaskAssignments(yDoc);
  const existing = assignments.get(taskId);
  if (existing) {
    return existing;
  }

  const assignment = new YjsMap<unknown>();
  assignments.set(taskId, assignment);
  return assignment;
}

export function clearTaskPropertyAssignments(
  yDoc: Doc,
  propertyId: string,
  optionId?: string,
  multiple = false
) {
  if (!propertyId) {
    return;
  }
  const assignments = getTaskAssignments(yDoc);
  const assignmentKey = getPropertyAssignmentKey(propertyId);

  for (const [taskId, assignment] of assignments) {
    if (optionId === undefined) {
      assignment.delete(assignmentKey);
    } else {
      const value = assignment.get(assignmentKey);
      if (multiple && Array.isArray(value)) {
        const next = value.filter((candidate) => candidate !== optionId);
        if (next.length === value.length) {
          continue;
        }
        if (next.length > 0) {
          assignment.set(assignmentKey, next);
        } else {
          assignment.delete(assignmentKey);
        }
      } else if (value === optionId) {
        assignment.delete(assignmentKey);
      } else {
        continue;
      }
    }
    if (assignment.size === 0) {
      assignments.delete(taskId);
    }
  }
}

export function getTaskPropertyValue(
  assignment: YMap<unknown> | undefined,
  property: PropertyDefinition
): PropertyValue | undefined {
  return normalizePropertyValue(
    property,
    assignment?.get(getPropertyAssignmentKey(property.id))
  );
}

export function setTaskPropertyValue(
  yDoc: Doc,
  taskId: string,
  propertyId: string,
  value: PropertyValue | null
) {
  const assignments = getTaskAssignments(yDoc);
  const assignmentKey = getPropertyAssignmentKey(propertyId);
  if (value === null || !hasPropertyValue(value)) {
    const assignment = assignments.get(taskId);
    assignment?.delete(assignmentKey);
    if (assignment?.size === 0) {
      assignments.delete(taskId);
    }
    return;
  }
  getOrCreateTaskAssignment(yDoc, taskId).set(assignmentKey, value);
}
