import { describe, expect, it } from "vitest";
import { Doc, Map as YMap } from "yjs";
import {
  clearTaskPropertyAssignments,
  getPropertyAssignmentKey,
  getPropertyIdFromAssignmentKey,
  getTaskAssignments,
} from "./task-assignments";

function addAssignment(
  doc: Doc,
  taskId: string,
  values: Record<string, unknown>
) {
  const assignment = new YMap<unknown>();
  for (const [key, value] of Object.entries(values)) {
    assignment.set(key, value);
  }
  getTaskAssignments(doc).set(taskId, assignment);
}

describe("clearTaskPropertyAssignments", () => {
  it("clears a deleted property while preserving other assignments", () => {
    const doc = new Doc();
    addAssignment(doc, "task-1", {
      prop_priority: "high",
      prop_status: "todo",
    });
    addAssignment(doc, "task-2", { prop_status: "done" });

    clearTaskPropertyAssignments(doc, "status");

    expect(getTaskAssignments(doc).toJSON()).toEqual({
      "task-1": { prop_priority: "high" },
    });
    doc.destroy();
  });

  it("clears only assignments using a deleted option", () => {
    const doc = new Doc();
    addAssignment(doc, "task-1", { prop_status: "todo" });
    addAssignment(doc, "task-2", { prop_status: "done" });

    clearTaskPropertyAssignments(doc, "status", "todo");

    expect(getTaskAssignments(doc).toJSON()).toEqual({
      "task-2": { prop_status: "done" },
    });
    doc.destroy();
  });

  it("removes one deleted Multi-select option without losing other values", () => {
    const doc = new Doc();
    addAssignment(doc, "task-1", { prop_labels: ["bug", "feature"] });
    addAssignment(doc, "task-2", { prop_labels: ["bug"] });

    clearTaskPropertyAssignments(doc, "labels", "bug", true);

    expect(getTaskAssignments(doc).toJSON()).toEqual({
      "task-1": { prop_labels: ["feature"] },
    });
    doc.destroy();
  });
});

describe("property assignment keys", () => {
  it("round-trips property IDs and rejects unrelated keys", () => {
    const key = getPropertyAssignmentKey("status");

    expect(key).toBe("prop_status");
    expect(getPropertyIdFromAssignmentKey(key)).toBe("status");
    expect(getPropertyIdFromAssignmentKey("status")).toBeNull();
  });
});
