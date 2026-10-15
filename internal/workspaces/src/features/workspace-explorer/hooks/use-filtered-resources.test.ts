import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../store", () => ({
  useWorkspaceResources: vi.fn(),
}));

import { useWorkspaceResources } from "../store";
import { useFilteredResources } from "./use-filtered-resources";

function makeItem(
  overrides: Partial<WorkspaceResourceEntity> & { id: string }
): WorkspaceResourceEntity {
  return {
    workspace_id: "workspace_1",
    name: "item",
    icon: null,
    position: 0,
    parent_id: null,
    resource_type_id: "markdown",
    schema_version: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

const mockedUseWorkspaceResources = vi.mocked(useWorkspaceResources);

describe("useFilteredResources", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns [] for empty query", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "1", name: "Alpha" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual([]);
  });

  it("returns [] for whitespace-only query", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "1", name: "Alpha" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("   ", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual([]);
  });

  it("excludes folders without a resource type", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({
        id: "folder",
        name: "alpha",
        resource_type_id: null,
      }),
      makeItem({ id: "doc", name: "alpha" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("alpha", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.map((i) => i.id)).toEqual(["doc"]);
  });

  it("excludes items without resource_type_id", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "1", name: "alpha", resource_type_id: null }),
      makeItem({ id: "2", name: "alpha", resource_type_id: "md" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("alpha", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.map((i) => i.id)).toEqual(["2"]);
  });

  it("is case-insensitive", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "1", name: "HELLO world" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("HELLO", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.map((i) => i.id)).toEqual(["1"]);
  });

  it("sorts results alphabetically", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "b", name: "Beta" }),
      makeItem({ id: "a", name: "alpha" }),
      makeItem({ id: "c", name: "Charlie" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("a", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.map((i) => i.name)).toEqual([
      "alpha",
      "Beta",
      "Charlie",
    ]);
  });

  it("debounces query updates", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "1", name: "alpha" }),
    ]);
    const { result, rerender } = renderHook(
      ({ q }) => useFilteredResources(q, 150),
      { initialProps: { q: "" } }
    );
    rerender({ q: "alpha" });
    expect(result.current).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(result.current).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.map((i) => i.id)).toEqual(["1"]);
  });

  it("handles items with empty name", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "1", name: "" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("a", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual([]);
  });

  it("matches substring anywhere in name", () => {
    mockedUseWorkspaceResources.mockReturnValue([
      makeItem({ id: "1", name: "My awesome doc" }),
    ]);
    const { result } = renderHook(() => useFilteredResources("awesome", 0));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.map((i) => i.id)).toEqual(["1"]);
  });
});
