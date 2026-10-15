// @vitest-environment happy-dom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useResourceMentionSearch } from "./use-resource-mentions";

const mocks = vi.hoisted(() => ({
  searchResources: vi.fn(),
  dispose: vi.fn(),
  database: {},
}));
vi.mock("@powersync/react", () => ({ usePowerSync: () => mocks.database }));
vi.mock("@repo/data/features/agent-content", () => ({
  createDeviceReadCoordinator: () => ({ dispose: mocks.dispose }),
  createDeviceContentClient: () => ({ searchResources: mocks.searchResources }),
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("searches the active organization and falls back to cached resources", async () => {
  mocks.searchResources.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({
    items: [{ id: "resource", name: "Notes", workspaceId: "workspace", workspaceName: "Product", resourceTypeId: "lunaris.rich-text", storage: {} }],
  });
  const { result } = renderHook(() => useResourceMentionSearch("org"));
  const signal = new AbortController().signal;
  const items = await result.current("Notes", signal);
  expect(mocks.searchResources).toHaveBeenNthCalledWith(1, "org", { search: "Notes", limit: 8 }, { signal });
  expect(mocks.searchResources).toHaveBeenNthCalledWith(2, "org", { search: "Notes", limit: 8 }, { signal, consistency: "cached" });
  expect(items[0]?.reference).toEqual({ type: "workspace-resource", resourceId: "resource", workspaceId: "workspace" });
  expect(mocks.dispose).toHaveBeenCalled();
});

it("does not fall back after cancellation", async () => {
  const controller = new AbortController();
  mocks.searchResources.mockImplementation(async () => {
    controller.abort();
    throw new Error("Cancelled");
  });
  const { result } = renderHook(() => useResourceMentionSearch("org"));
  await expect(result.current("Notes", controller.signal)).rejects.toThrow("Cancelled");
  expect(mocks.searchResources).toHaveBeenCalledTimes(1);
  expect(mocks.dispose).toHaveBeenCalled();
});
