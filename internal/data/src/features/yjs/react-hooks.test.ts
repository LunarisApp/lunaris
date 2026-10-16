import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Doc } from "yjs";
import { useYArray, useYMapField, useYMapJson } from "./react-hooks";

describe("useYMapField", () => {
  function setup(initial?: Record<string, string>) {
    const doc = new Doc();
    const yMap = doc.getMap<string>("test");
    if (initial) {
      for (const [k, v] of Object.entries(initial)) {
        yMap.set(k, v);
      }
    }
    return { doc, yMap };
  }

  it("reads initial value", () => {
    const { yMap } = setup({ name: "Alice" });
    const { result } = renderHook(() => useYMapField(yMap, "name"));
    expect(result.current[0]).toBe("Alice");
  });

  it("returns empty string for missing key", () => {
    const { yMap } = setup();
    const { result } = renderHook(() => useYMapField(yMap, "missing"));
    expect(result.current[0]).toBe("");
  });

  it("updates on yMap.set()", () => {
    const { yMap } = setup({ name: "Alice" });
    const { result } = renderHook(() => useYMapField(yMap, "name"));

    act(() => yMap.set("name", "Bob"));
    expect(result.current[0]).toBe("Bob");
  });

  it("setter writes to yMap", () => {
    const { yMap } = setup({ name: "Alice" });
    const { result } = renderHook(() => useYMapField(yMap, "name"));

    act(() => result.current[1]("Charlie"));
    expect(yMap.get("name")).toBe("Charlie");
    expect(result.current[0]).toBe("Charlie");
  });
});

describe("useYMapJson", () => {
  function setup(initial?: Record<string, string>) {
    const doc = new Doc();
    const yMap = doc.getMap<string>("test");
    if (initial) {
      for (const [k, v] of Object.entries(initial)) {
        yMap.set(k, v);
      }
    }
    return { doc, yMap };
  }

  it("reads and parses JSON", () => {
    const { yMap } = setup({ tags: JSON.stringify(["a", "b"]) });
    const { result } = renderHook(() =>
      useYMapJson<string[]>(yMap, "tags", [])
    );
    expect(result.current[0]).toEqual(["a", "b"]);
  });

  it("returns fallback on missing key", () => {
    const { yMap } = setup();
    const { result } = renderHook(() =>
      useYMapJson<string[]>(yMap, "tags", ["default"])
    );
    expect(result.current[0]).toEqual(["default"]);
  });

  it("returns fallback on invalid JSON", () => {
    const { yMap } = setup({ tags: "not-json" });
    const { result } = renderHook(() =>
      useYMapJson<string[]>(yMap, "tags", [])
    );
    expect(result.current[0]).toEqual([]);
  });

  it("updates on change", () => {
    const { yMap } = setup({ tags: JSON.stringify(["a"]) });
    const { result } = renderHook(() =>
      useYMapJson<string[]>(yMap, "tags", [])
    );

    act(() => yMap.set("tags", JSON.stringify(["a", "b", "c"])));
    expect(result.current[0]).toEqual(["a", "b", "c"]);
  });

  it("setter writes JSON to yMap", () => {
    const { yMap } = setup();
    const { result } = renderHook(() =>
      useYMapJson<string[]>(yMap, "tags", [])
    );

    act(() => result.current[1](["x", "y"]));
    expect(yMap.get("tags")).toBe(JSON.stringify(["x", "y"]));
  });
});

describe("useYArray", () => {
  it("tracks array changes (shallow)", () => {
    const doc = new Doc();
    const { result } = renderHook(() => useYArray(doc, "items"));

    expect(result.current.items).toHaveLength(0);

    act(() => result.current.add({ name: "Item 1" }));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.get("name")).toBe("Item 1");
  });

  it("add and remove work", () => {
    const doc = new Doc();
    const { result } = renderHook(() => useYArray(doc, "items"));

    act(() => {
      result.current.add({ name: "A" });
      result.current.add({ name: "B" });
    });
    expect(result.current.items).toHaveLength(2);

    act(() => result.current.remove(0));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.get("name")).toBe("B");
  });

  it("tracks nested YMap mutations with deep option", () => {
    const doc = new Doc();
    const { result } = renderHook(() =>
      useYArray(doc, "items", { deep: true })
    );

    act(() => result.current.add({ name: "Original" }));
    expect(result.current.items[0]!.get("name")).toBe("Original");

    act(() => result.current.items[0]!.set("name", "Updated"));
    expect(result.current.items[0]!.get("name")).toBe("Updated");
  });
});
