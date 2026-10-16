/** @vitest-environment happy-dom */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityReferenceSearch } from "./entity-reference-hooks";

const mocks = vi.hoisted(() => {
  const listWorkspaces = vi.fn();
  const searchResources = vi.fn();
  const runtime = { listWorkspaces, searchResources };
  return { currentRuntime: runtime, listWorkspaces, runtime, searchResources };
});

vi.mock("./runtime-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runtime-context")>()),
  useCurrentWorkspace: () => ({
    workspace: { id: "workspace_1", name: "Launch" },
    workspaceId: "workspace_1",
  }),
  useLunarisContent: () => mocks.currentRuntime,
  useWorkspaceResourcesMap: () =>
    new Map([
      [
        "item_1",
        {
          name: "Launch plan",
          parentId: null,
          resourceTypeId: "lunaris.rich-text",
          resourceId: "item_1",
          storage: { content: { kind: "yjs", storageId: "storage_1" } },
        },
      ],
    ]),
}));

beforeEach(() => {
  mocks.currentRuntime = mocks.runtime;
  mocks.listWorkspaces.mockReset().mockResolvedValue({
    items: [
      { id: "workspace_1", name: "Launch" },
      { id: "workspace_2", name: "Product" },
    ],
    nextCursor: null,
  });
  mocks.searchResources
    .mockReset()
    .mockImplementation(({ search }: { search: string }) => {
      const items = [
        {
          name: "Launch plan",
          parentId: null,
          resourceId: "item_1",
          resourceTypeId: "lunaris.rich-text",
          storage: { content: { kind: "yjs", storageId: "storage_1" } },
          workspaceId: "workspace_1",
          workspaceName: "Launch",
        },
        {
          name: "Product brief",
          parentId: null,
          resourceId: "item_2",
          resourceTypeId: "lunaris.rich-text",
          storage: { content: { kind: "yjs", storageId: "storage_2" } },
          workspaceId: "workspace_2",
          workspaceName: "Product",
        },
      ];
      const normalizedSearch = search.toLocaleLowerCase();
      return Promise.resolve({
        items: items.filter(
          (item) =>
            item.name.toLocaleLowerCase().includes(normalizedSearch) ||
            item.workspaceName.toLocaleLowerCase().includes(normalizedSearch)
        ),
        nextCursor: null,
      });
    });
});

describe("useEntityReferenceSearch", () => {
  it("merges current cached entities with organization search and deduplicates", async () => {
    const { result } = renderHook(() => useEntityReferenceSearch());

    const initial = await result.current("");
    expect(initial.map((item) => item.name)).toEqual(["Launch", "Launch plan"]);
    expect(mocks.listWorkspaces).not.toHaveBeenCalled();
    expect(mocks.searchResources).not.toHaveBeenCalled();

    const searched = await result.current("launch");

    expect(searched.map((item) => item.name)).toEqual([
      "Launch",
      "Launch plan",
    ]);
    expect(mocks.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(mocks.searchResources).toHaveBeenCalledWith({
      consistency: "confirmed",
      limit: 8,
      search: "launch",
    });
    expect(mocks.listWorkspaces).toHaveBeenCalledWith({
      consistency: "confirmed",
      cursor: undefined,
      limit: 100,
    });
  });

  it("returns matching documents from other workspaces", async () => {
    mocks.searchResources.mockResolvedValueOnce({
      items: [
        {
          name: "Product brief",
          parentId: null,
          resourceId: "item_2",
          resourceTypeId: "lunaris.rich-text",
          storage: { content: { kind: "yjs", storageId: "storage_2" } },
          workspaceId: "workspace_2",
          workspaceName: "Product",
        },
      ],
      nextCursor: null,
    });
    const { result } = renderHook(() => useEntityReferenceSearch());

    const searched = await result.current("brief");

    expect(searched).toEqual([
      expect.objectContaining({
        name: "Product brief",
        workspaceName: "Product",
        reference: {
          resourceId: "item_2",
          workspaceId: "workspace_2",
          type: "workspace-resource",
        },
      }),
    ]);
  });

  it("keeps current-workspace results when listing workspaces fails", async () => {
    mocks.listWorkspaces.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useEntityReferenceSearch());

    const initial = await result.current("");

    expect(initial.map((item) => item.name)).toEqual(["Launch", "Launch plan"]);
    expect(mocks.listWorkspaces).not.toHaveBeenCalled();
    expect(mocks.searchResources).not.toHaveBeenCalled();
  });

  it("keeps workspace and local results when organization search fails", async () => {
    mocks.searchResources.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useEntityReferenceSearch());

    const searched = await result.current("launch");

    expect(searched.map((item) => item.name)).toEqual([
      "Launch",
      "Launch plan",
    ]);
  });

  it("falls back to cached organization results when confirmation fails", async () => {
    mocks.listWorkspaces.mockRejectedValueOnce(new Error("offline"));
    mocks.searchResources.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useEntityReferenceSearch());

    const searched = await result.current("product");

    expect(searched.map((item) => item.name)).toEqual([
      "Product",
      "Product brief",
    ]);
    expect(mocks.listWorkspaces).toHaveBeenCalledWith({
      consistency: "cached",
      cursor: undefined,
      limit: 100,
    });
    expect(mocks.searchResources).toHaveBeenCalledWith({
      consistency: "cached",
      limit: 8,
      search: "product",
    });
  });

  it("does not reuse a stale workspace request after the runtime changes", async () => {
    let resolveStale: (value: {
      items: { id: string; name: string }[];
      nextCursor: null;
    }) => void = () => undefined;
    mocks.listWorkspaces.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStale = resolve;
      })
    );
    const { rerender, result } = renderHook(() => useEntityReferenceSearch());
    const staleSearch = result.current("product");
    const nextRuntime = {
      listWorkspaces: vi.fn().mockResolvedValue({
        items: [{ id: "workspace_2", name: "Product" }],
        nextCursor: null,
      }),
      searchResources: vi
        .fn()
        .mockResolvedValue({ items: [], nextCursor: null }),
    };

    mocks.currentRuntime = nextRuntime;
    rerender();
    await result.current("product");
    resolveStale({
      items: [{ id: "workspace_stale", name: "Stale" }],
      nextCursor: null,
    });
    await staleSearch;

    const latest = await result.current("product");
    expect(latest.map((item) => item.name)).toEqual(["Product"]);
    expect(nextRuntime.listWorkspaces).toHaveBeenCalledTimes(1);
  });
});
