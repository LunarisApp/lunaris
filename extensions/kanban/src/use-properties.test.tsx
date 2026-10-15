import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Doc, Map as YMap } from "yjs";
import { movePropertyDefinition } from "./property-state";
import { useProperties } from "./use-properties";

describe("useProperties", () => {
  it("updates consumers after properties are reordered", () => {
    const doc = new Doc();
    const properties = doc.getArray<YMap<string>>("properties");
    for (const id of ["status", "priority"]) {
      const property = new YMap<string>();
      property.set("id", id);
      property.set("name", id);
      property.set("options", "[]");
      property.set("type", "select");
      properties.push([property]);
    }
    const { result, unmount } = renderHook(() => useProperties(doc));

    act(() => doc.transact(() => movePropertyDefinition(properties, 0, 1)));

    expect(result.current.properties.map(({ id }) => id)).toEqual([
      "priority",
      "status",
    ]);
    unmount();
    doc.destroy();
  });
});
