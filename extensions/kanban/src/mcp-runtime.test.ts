import { describe, expect, it } from "vitest";
import {
  Doc,
  Map as YMap,
} from "yjs";
import {
  getKanbanBoardProperties,
  KanbanMcpInputError,
  updateKanbanTaskProperties,
} from "./mcp-runtime";

describe("getKanbanBoardProperties", () => {
  it("returns the effective default without mutating an empty board", () => {
    const doc = new Doc();

    expect(getKanbanBoardProperties(doc)).toEqual([
      expect.objectContaining({
        id: "status",
        name: "Status",
      }),
    ]);
    expect(doc.getArray("properties")).toHaveLength(0);
  });

  it("returns custom property definitions and options", () => {
    const doc = new Doc();
    const property = new YMap<string>();
    doc.getArray<YMap<string>>("properties").push([property]);
    property.set("id", "priority");
    property.set("name", "Priority");
    property.set("type", "select");
    property.set(
      "options",
      JSON.stringify([
        { color: "#f00", id: "high", name: "High" },
      ]),
    );

    expect(getKanbanBoardProperties(doc)).toEqual([
      {
        id: "priority",
        name: "Priority",
        options: [{ color: "#f00", id: "high", name: "High" }],
        type: "select",
      },
    ]);
  });

  it("strips undeclared option fields", () => {
    const doc = new Doc();
    const property = new YMap<string>();
    doc.getArray<YMap<string>>("properties").push([property]);
    property.set("id", "priority");
    property.set("name", "Priority");
    property.set("type", "select");
    property.set(
      "options",
      JSON.stringify([
        {
          color: "#f00",
          id: "high",
          internal: "must-not-leak",
          name: "High",
        },
      ]),
    );

    const [definition] = getKanbanBoardProperties(doc);
    expect(definition && "options" in definition ? definition.options : []).toEqual([
      { color: "#f00", id: "high", name: "High" },
    ]);
  });

  it("keeps an explicitly initialized empty board empty", () => {
    const doc = new Doc();
    doc.getMap<unknown>("kanbanMeta").set("propertiesInitialized", true);

    expect(getKanbanBoardProperties(doc)).toEqual([]);
    expect(() =>
      updateKanbanTaskProperties(doc, "task-1", { Status: "Todo" })
    ).toThrow("Unknown Kanban property");
  });
});

describe("updateKanbanTaskProperties", () => {
  it("initializes and assigns the default status by name", () => {
    const doc = new Doc();

    expect(
      updateKanbanTaskProperties(doc, "task-1", {
        Status: "In Progress",
      }),
    ).toEqual({ status: "in-progress" });
    expect(doc.getArray("properties")).toHaveLength(1);
    expect(
      doc
        .getMap<YMap<string>>("taskAssignments")
        .get("task-1")
        ?.get("prop_status"),
    ).toBe("in-progress");
  });

  it("assigns custom properties by ID and clears them", () => {
    const doc = new Doc();
    const property = new YMap<string>();
    doc.getArray<YMap<string>>("properties").push([property]);
    property.set("id", "priority");
    property.set("name", "Priority");
    property.set("type", "select");
    property.set(
      "options",
      JSON.stringify([
        { color: "#f00", id: "high", name: "High" },
      ]),
    );

    expect(
      updateKanbanTaskProperties(doc, "task-1", { priority: "high" }),
    ).toEqual({ priority: "high" });
    expect(
      updateKanbanTaskProperties(doc, "task-1", { priority: null }),
    ).toEqual({});
    expect(
      doc.getMap<YMap<string>>("taskAssignments").has("task-1"),
    ).toBe(false);
  });

  it("rejects unknown properties and options", () => {
    const doc = new Doc();
    expect(() =>
      updateKanbanTaskProperties(doc, "task-1", { Missing: "Value" }),
    ).toThrow(KanbanMcpInputError);
    expect(() =>
      updateKanbanTaskProperties(doc, "task-1", { Status: "Blocked" }),
    ).toThrow("Unknown Kanban option");
  });

  it("assigns every typed property and validates People membership", () => {
    const doc = new Doc();
    const definitions = [
      { id: "labels", name: "Labels", type: "multi-select", options: [{ color: "#f00", id: "bug", name: "Bug" }] },
      { id: "people", name: "People", type: "people" },
      { id: "due", name: "Due", type: "date" },
      { id: "note", name: "Note", type: "text" },
      { id: "estimate", name: "Estimate", type: "number" },
      { id: "blocked", name: "Blocked", type: "checkbox" },
      { id: "resource", name: "Document", type: "resource" },
    ] as const;
    for (const definition of definitions) {
      const property = new YMap<unknown>();
      for (const [key, value] of Object.entries(definition)) {
        property.set(
          key,
          key === "options" ? JSON.stringify(value) : value
        );
      }
      doc.getArray<YMap<unknown>>("properties").push([property]);
    }

    expect(
      updateKanbanTaskProperties(
        doc,
        "task-1",
        {
          Blocked: true,
          Due: "2026-08-25T14:30:00+02:00",
          Document: {
            resourceId: "item-1",
            name: "Roadmap",
            resourceTypeId: "lunaris.rich-text",
            workspaceId: "workspace-1",
            workspaceName: "Launch",
          },
          Estimate: 3.5,
          Labels: ["Bug"],
          Note: "Ship safely",
          People: ["user-1"],
        },
        { allowedPersonIds: new Set(["user-1"]) }
      )
    ).toEqual({
      blocked: true,
      due: "2026-08-25T12:30:00.000Z",
      resource: {
        resourceId: "item-1",
        name: "Roadmap",
        resourceTypeId: "lunaris.rich-text",
        workspaceId: "workspace-1",
        workspaceName: "Launch",
      },
      estimate: 3.5,
      labels: ["bug"],
      note: "Ship safely",
      people: ["user-1"],
    });
    expect(() =>
      updateKanbanTaskProperties(
        doc,
        "task-1",
        { People: ["unknown"] },
        { allowedPersonIds: new Set(["user-1"]) }
      )
    ).toThrow("Unknown organization member ID");

    const assignment = doc
      .getMap<YMap<unknown>>("taskAssignments")
      .get("task-1");
    assignment?.set("prop_people", ["removed-user"]);
    expect(
      updateKanbanTaskProperties(
        doc,
        "task-1",
        { People: ["removed-user", "user-1"] },
        { allowedPersonIds: new Set(["user-1"]) }
      )
    ).toMatchObject({ people: ["removed-user", "user-1"] });
    expect(() =>
      updateKanbanTaskProperties(
        doc,
        "task-1",
        { People: ["removed-user", "new-unknown"] },
        { allowedPersonIds: new Set(["user-1"]) }
      )
    ).toThrow("Unknown organization member ID");
    expect(() =>
      updateKanbanTaskProperties(doc, "task-1", { Due: "next Tuesday" })
    ).toThrow("requires YYYY-MM-DD or RFC 3339 date");
    expect(() =>
      updateKanbanTaskProperties(doc, "task-1", {
        Document: {
          resourceId: "item-1",
          name: "Roadmap",
          resourceTypeId: "",
          workspaceId: "workspace-1",
          workspaceName: "Launch",
        },
      })
    ).toThrow("requires resource reference");
    expect(() =>
      updateKanbanTaskProperties(doc, "task-1", {
        Due: "2023-02-29T12:30:00Z",
      })
    ).toThrow("requires YYYY-MM-DD or RFC 3339 date");
  });

  it("omits malformed persisted values from outputs", () => {
    const doc = new Doc();
    const property = new YMap<unknown>();
    property.set("id", "estimate");
    property.set("name", "Estimate");
    property.set("type", "number");
    doc.getArray<YMap<unknown>>("properties").push([property]);
    const assignment = new YMap<unknown>();
    assignment.set("prop_estimate", "not-a-number");
    assignment.set("prop_deleted", true);
    doc.getMap<YMap<unknown>>("taskAssignments").set("task-1", assignment);

    expect(updateKanbanTaskProperties(doc, "task-1", undefined)).toEqual({});
  });
});
