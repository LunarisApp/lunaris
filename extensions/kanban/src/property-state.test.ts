import { describe, expect, it } from "vitest";
import { applyUpdate, Doc, encodeStateAsUpdate, Map as YMap } from "yjs";
import { DEFAULT_STATUS_PROPERTY } from "./constants";
import {
  appendPropertyDefinition,
  arePropertiesInitialized,
  getEffectivePropertyDefinitions,
  markPropertiesInitialized,
  movePropertyDefinition,
  orderPropertyMaps,
} from "./property-state";

describe("Kanban property initialization", () => {
  it("distinguishes a new board from an explicitly empty board", () => {
    const doc = new Doc();
    expect(arePropertiesInitialized(doc)).toBe(false);
    expect(getEffectivePropertyDefinitions(doc)).toEqual([
      DEFAULT_STATUS_PROPERTY,
    ]);

    markPropertiesInitialized(doc);
    expect(arePropertiesInitialized(doc)).toBe(true);
    expect(getEffectivePropertyDefinitions(doc)).toEqual([]);
    expect(doc.getArray("properties")).toHaveLength(0);
  });

  it("writes fresh Select definitions while recognizing existing boards", () => {
    const doc = new Doc();
    appendPropertyDefinition(
      doc.getArray<YMap<unknown>>("properties"),
      DEFAULT_STATUS_PROPERTY
    );

    expect(arePropertiesInitialized(doc)).toBe(true);
    expect(doc.getArray<YMap<unknown>>("properties").get(0)?.toJSON()).toEqual(
      expect.objectContaining({ id: "status", type: "select" })
    );
  });

  it("moves property definitions without losing their data", () => {
    const doc = new Doc();
    const properties = doc.getArray<YMap<string>>("properties");
    for (const id of ["status", "due-date", "assignees"]) {
      const property = new YMap<string>();
      property.set("id", id);
      property.set("name", id);
      property.set("type", id === "status" ? "select" : "text");
      if (id === "status") {
        property.set(
          "options",
          JSON.stringify([{ color: "#3b82f6", id: "todo", name: "Todo" }])
        );
      }
      properties.push([property]);
    }

    const status = properties.get(0);
    doc.transact(() => movePropertyDefinition(properties, 0, 2));

    const ordered = orderPropertyMaps(properties.toArray());
    expect(ordered.map((property) => property.get("id"))).toEqual([
      "due-date",
      "assignees",
      "status",
    ]);
    expect(ordered[2]).toBe(status);
    expect(ordered[2]?.toJSON()).toEqual({
      id: "status",
      name: "status",
      options: JSON.stringify([{ color: "#3b82f6", id: "todo", name: "Todo" }]),
      order: "2",
      type: "select",
    });

    doc.transact(() => movePropertyDefinition(properties, 2, 0));
    expect(
      orderPropertyMaps(properties.toArray()).map((property) =>
        property.get("id")
      )
    ).toEqual(["status", "due-date", "assignees"]);
    expect(orderPropertyMaps(properties.toArray())[0]).toBe(status);
  });

  it("preserves concurrent edits while a property is reordered", () => {
    const first = new Doc();
    for (const id of ["status", "priority"]) {
      const property = new YMap<string>();
      property.set("id", id);
      property.set("name", id);
      property.set("type", "text");
      first.getArray<YMap<string>>("properties").push([property]);
    }
    const second = new Doc();
    applyUpdate(second, encodeStateAsUpdate(first));

    first.transact(() =>
      movePropertyDefinition(first.getArray<YMap<string>>("properties"), 0, 1)
    );
    second
      .getArray<YMap<string>>("properties")
      .get(0)
      ?.set("name", "Renamed status");
    applyUpdate(first, encodeStateAsUpdate(second));
    applyUpdate(second, encodeStateAsUpdate(first));

    for (const doc of [first, second]) {
      const ordered = orderPropertyMaps(
        doc.getArray<YMap<string>>("properties").toArray()
      );
      expect(ordered.map((property) => property.get("id"))).toEqual([
        "priority",
        "status",
      ]);
      expect(ordered[1]?.get("name")).toBe("Renamed status");
      doc.destroy();
    }
  });

  it("ignores invalid property moves", () => {
    const doc = new Doc();
    const properties = doc.getArray<YMap<string>>("properties");
    const property = new YMap<string>();
    property.set("id", "status");
    properties.push([property]);

    movePropertyDefinition(properties, -1, 0);
    movePropertyDefinition(properties, 0, 1);

    expect(properties.toArray()).toEqual([property]);
  });
});
