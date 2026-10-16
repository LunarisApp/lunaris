/** @vitest-environment happy-dom */

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResourceContentSearch } from "./useResourceContentSearch";

const mocks = vi.hoisted(() => ({
  buildSearchIndexQuery: vi.fn(),
  queryResult: {
    data: [] as Array<{
      preview: string;
      workspace_id: string;
      workspace_name: string | null;
      workspace_slug: string | null;
      rank: number;
      resource_id: string;
      resource_name: string | null;
      resource_type_id: string;
    }>,
    isFetching: false,
  },
  subscribe: vi.fn(),
  syncStream: vi.fn(),
  unsubscribe: vi.fn(),
  waitForFirstSync: vi.fn(),
  organizationResources: [
    {
      id: "resource-other",
      name: "Other roadmap",
      workspace_id: "workspace-other",
      workspace_name: "Other Workspace",
      workspace_slug: "other-workspace",
      workspace_visibility: "shared",
      resource_type_id: "acme.note",
    },
    {
      id: "resource-beta",
      name: "Beta roadmap",
      workspace_id: "workspace-beta",
      workspace_name: "Beta Workspace",
      workspace_slug: "beta-workspace",
      workspace_visibility: "shared",
      resource_type_id: "acme.note",
    },
  ],
}));

vi.mock("@repo/data/core", () => ({
  SYNC_ACCESS: { cloud: "cloud" },
  usePowerSync: () => ({ syncStream: mocks.syncStream }),
  useQuery: () => mocks.queryResult,
  useSyncAccess: () => "cloud",
}));

vi.mock("@repo/data/features/workspace-resources", () => ({
  useOrganizationWorkspaceResourcesQuery: () => ({
    data: mocks.organizationResources,
  }),
}));

vi.mock("@repo/data/features/search-index", () => ({
  buildSearchIndexQuery: mocks.buildSearchIndexQuery,
  parseSearchSnippet: (preview: string) => ({ highlights: [], text: preview }),
}));

vi.mock("./useSearchResourceTypes", () => ({
  useSearchResourceTypes: () => new Map(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../workspace", () => ({
  useOptionalCurrentWorkspace: () => ({
    workspace: { organization_id: "organization-1" },
    workspaceId: "workspace-current",
  }),
}));

beforeEach(() => {
  mocks.queryResult = { data: [], isFetching: false };
  mocks.buildSearchIndexQuery.mockReturnValue({ params: [], sql: "search" });
  mocks.waitForFirstSync.mockResolvedValue(undefined);
  mocks.subscribe.mockResolvedValue({
    unsubscribe: mocks.unsubscribe,
    waitForFirstSync: mocks.waitForFirstSync,
  });
  mocks.syncStream.mockReturnValue({ subscribe: mocks.subscribe });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useResourceContentSearch hydration", () => {
  it("hydrates other workspaces when search opens before a query is entered", async () => {
    const { unmount } = renderHook(() => useResourceContentSearch("", 0, true));

    await waitFor(() => {
      expect(mocks.syncStream).toHaveBeenCalledTimes(2);
      expect(mocks.syncStream).toHaveBeenCalledWith("workspace_content", {
        workspace_id: "workspace-other",
      });
      expect(mocks.syncStream).toHaveBeenCalledWith("workspace_content", {
        workspace_id: "workspace-beta",
      });
    });

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("does not hydrate while search is closed", () => {
    renderHook(() => useResourceContentSearch("query", 0, false));

    expect(mocks.syncStream).not.toHaveBeenCalled();
  });

  it("hydrates only workspaces allowed by scoped filters", async () => {
    renderHook(() =>
      useResourceContentSearch("workspace:Beta roadmap", 0, true)
    );

    await waitFor(() => {
      expect(mocks.syncStream).toHaveBeenCalledOnce();
      expect(mocks.syncStream).toHaveBeenCalledWith("workspace_content", {
        workspace_id: "workspace-beta",
      });
    });
  });

  it("skips FTS for qualifier-only queries", () => {
    renderHook(() => useResourceContentSearch("workspace:Beta", 0, true));

    expect(mocks.buildSearchIndexQuery).not.toHaveBeenCalled();
    expect(mocks.syncStream).not.toHaveBeenCalled();
  });

  it("keeps settled index results while a changed query is fetching", async () => {
    mocks.queryResult = {
      data: [
        {
          preview: "First preview",
          workspace_id: "workspace-current",
          workspace_name: "Current workspace",
          workspace_slug: "current-workspace",
          rank: 1,
          resource_id: "resource-1",
          resource_name: "First result",
          resource_type_id: "acme.note",
        },
      ],
      isFetching: false,
    };
    const { result, rerender } = renderHook(
      ({ query }) => useResourceContentSearch(query, 0, true),
      { initialProps: { query: "first" } }
    );

    expect(result.current).toHaveLength(1);

    mocks.queryResult = { data: [], isFetching: true };
    rerender({ query: "second" });

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });

    mocks.queryResult = { data: [], isFetching: false };
    rerender({ query: "second" });

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });
});
