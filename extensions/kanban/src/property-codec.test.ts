import { describe, expect, it } from "vitest";
import { Doc, Map as YMap } from "yjs";
import {
  canonicalPropertyDate,
  formatPropertyValue,
  isPropertyDate,
  normalizePropertyValue,
  parsePropertyDefinition,
} from "./property-codec";
import type { PropertyDefinition } from "./types";

describe("property definitions", () => {
  it("reads current resource references without changing stored data", () => {
    const doc = new Doc();
    const property = new YMap<string>();
    doc.getArray<YMap<string>>("properties").push([property]);
    property.set("id", "reference");
    property.set("name", "Related resource");
    property.set("type", "resource");

    expect(parsePropertyDefinition(property)).toEqual({
      id: "reference",
      name: "Related resource",
      type: "resource",
    });
    expect(property.get("type")).toBe("resource");
    doc.destroy();
  });
  it("reads Select definitions and sanitizes options", () => {
    const property = new YMap<string>();
    new Doc().getArray<YMap<string>>("properties").push([property]);
    property.set("id", "status");
    property.set("name", "Status");
    property.set("type", "select");
    property.set(
      "options",
      JSON.stringify([
        { color: "#fff", id: "todo", name: "Todo", private: true },
        { id: "broken" },
      ])
    );

    expect(parsePropertyDefinition(property)).toEqual({
      id: "status",
      name: "Status",
      options: [{ color: "#fff", id: "todo", name: "Todo" }],
      type: "select",
    });
  });

  it.each(["document", "label", undefined, null, "", "unknown"])(
    "rejects unsupported property type %s without changing stored data",
    (type) => {
      const doc = new Doc();
      const property = new YMap<unknown>();
      doc.getArray<YMap<unknown>>("properties").push([property]);
      property.set("id", "priority");
      property.set("name", "Priority");
      if (type !== undefined) property.set("type", type);

      expect(parsePropertyDefinition(property)).toBeNull();
      expect(property.get("type")).toBe(type);
      doc.destroy();
    },
  );
});

describe("property values", () => {
  const definitions: PropertyDefinition[] = [
    {
      id: "status",
      name: "Status",
      options: [{ color: "#fff", id: "todo", name: "Todo" }],
      type: "select",
    },
    {
      id: "labels",
      name: "Labels",
      options: [
        { color: "#fff", id: "bug", name: "Bug" },
        { color: "#000", id: "feature", name: "Feature" },
      ],
      type: "multi-select",
    },
    { id: "people", name: "People", type: "people" },
    { id: "date", name: "Date", type: "date" },
    { id: "text", name: "Text", type: "text" },
    { id: "number", name: "Number", type: "number" },
    { id: "check", name: "Check", type: "checkbox" },
    { id: "resource", name: "Document", type: "resource" },
  ];

  it("normalizes every supported type and drops malformed values", () => {
    expect(normalizePropertyValue(definitions[0]!, "todo")).toBe("todo");
    expect(normalizePropertyValue(definitions[0]!, "missing")).toBeUndefined();
    expect(
      normalizePropertyValue(definitions[1]!, ["bug", "bug", "missing"])
    ).toEqual(["bug"]);
    expect(normalizePropertyValue(definitions[2]!, ["user-1", "user-1"])).toEqual([
      "user-1",
    ]);
    expect(normalizePropertyValue(definitions[3]!, "2026-08-25")).toBe(
      "2026-08-25"
    );
    expect(normalizePropertyValue(definitions[4]!, "Keep spacing")).toBe(
      "Keep spacing"
    );
    expect(normalizePropertyValue(definitions[5]!, 2.5)).toBe(2.5);
    expect(normalizePropertyValue(definitions[5]!, Number.NaN)).toBeUndefined();
    expect(normalizePropertyValue(definitions[6]!, false)).toBe(false);
    expect(
      normalizePropertyValue(definitions[7]!, {
        resourceId: "item-1",
        name: "Roadmap",
        resourceTypeId: "lunaris.rich-text",
        private: "drop-me",
        workspaceId: "workspace-1",
        workspaceName: "Launch",
      })
    ).toEqual({
      resourceId: "item-1",
      name: "Roadmap",
      resourceTypeId: "lunaris.rich-text",
      workspaceId: "workspace-1",
      workspaceName: "Launch",
    });
    expect(
      normalizePropertyValue(definitions[7]!, {
        name: "Roadmap",
      })
    ).toBeUndefined();
    expect(
      normalizePropertyValue(definitions[7]!, {
        resourceId: "file-1",
        name: "Budget.pdf",
        resourceTypeId: "lunaris.file",
        workspaceId: "workspace-1",
        workspaceName: "Launch",
      })
    ).toMatchObject({ resourceTypeId: "lunaris.file" });
  });

  it("validates date-only and RFC 3339 values without timezone ambiguity", () => {
    expect(isPropertyDate("2024-02-29")).toBe(true);
    expect(isPropertyDate("2023-02-29")).toBe(false);
    expect(isPropertyDate("2026-08-25T12:30:00Z")).toBe(true);
    expect(isPropertyDate("2026-08-25T12:30")).toBe(false);
    expect(isPropertyDate("2023-02-29T12:30:00Z")).toBe(false);
    expect(isPropertyDate("2026-08-25T24:00:00Z")).toBe(false);
    expect(canonicalPropertyDate("2026-08-25T14:30:00+02:00")).toBe(
      "2026-08-25T12:30:00.000Z"
    );
  });

  it("formats options, people, and booleans", () => {
    expect(formatPropertyValue(definitions[0]!, "todo")).toBe("Todo");
    expect(
      formatPropertyValue(definitions[1]!, ["feature", "bug"])
    ).toBe("Feature, Bug");
    expect(
      formatPropertyValue(definitions[2]!, ["user-1"], {
        resolvePerson: () => "Ada",
      })
    ).toBe("Ada");
    expect(
      formatPropertyValue(definitions[6]!, false, { booleanFalse: "No" })
    ).toBe("No");
    expect(
      formatPropertyValue(definitions[3]!, "2026-08-25T14:30:00+02:00", {
        canonicalDates: true,
      })
    ).toBe("2026-08-25T12:30:00.000Z");
    expect(
      formatPropertyValue(definitions[5]!, 1000.5, {
        canonicalNumbers: true,
      })
    ).toBe("1000.5");
    expect(
      formatPropertyValue(definitions[7]!, {
        resourceId: "item-1",
        name: "Roadmap",
        resourceTypeId: "lunaris.rich-text",
        workspaceId: "workspace-1",
        workspaceName: "Launch",
      })
    ).toBe("Roadmap");
  });
});
