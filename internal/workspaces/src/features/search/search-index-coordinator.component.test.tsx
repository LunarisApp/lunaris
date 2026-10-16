/** @vitest-environment happy-dom */

import type {
  RegisteredSearchIndexer,
  ResourceTypeContribution,
} from "@lunarisapp/plugin-sdk";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexableResourceRow } from "./search-index-runtime";
import { SearchIndexCoordinator } from "./search-index-coordinator";

const mocks = vi.hoisted(() => ({
  database: {},
  deleteStaleSearchIndexEntries: vi.fn(),
  getSearchIndexRevisions: vi.fn(),
  indexers: [] as RegisteredSearchIndexer[],
  queryData: [] as IndexableResourceRow[],
  resourceTypes: [] as ResourceTypeContribution[],
  runSearchIndexJob: vi.fn(),
}));

vi.mock("@lunarisapp/plugin-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lunarisapp/plugin-sdk")>()),
  useResourceTypes: () => mocks.resourceTypes,
  useSearchIndexers: () => mocks.indexers,
}));

vi.mock("@repo/data/core", () => ({
  usePowerSync: () => mocks.database,
  useQuery: () => ({ data: mocks.queryData, isLoading: false }),
}));

vi.mock("@repo/data/features/search-index", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@repo/data/features/search-index")
  >()),
  deleteStaleSearchIndexEntries: mocks.deleteStaleSearchIndexEntries,
  getSearchIndexRevisions: mocks.getSearchIndexRevisions,
}));

vi.mock("../workspace", () => ({
  useOptionalCurrentWorkspace: () => ({
    workspace: { organization_id: "organization-1" },
  }),
}));

vi.mock("./search-index-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./search-index-runtime")>()),
  runSearchIndexJob: mocks.runSearchIndexJob,
}));

const definition = {
  resourceTypeId: "acme.note",
  schema: { id: "acme.note.schema" },
  storage: { content: { kind: "yjs" } },
} as unknown as ResourceTypeContribution;

const indexer = {
  definition: {
    extractText: () => null,
    id: "acme.note.indexer",
    resourceTypeIds: ["acme.note"],
    type: "search-indexer",
  },
  extensionId: "acme.note",
  extensionVersion: "1.0.0",
} as RegisteredSearchIndexer;

const row: IndexableResourceRow = {
  file_pending_count: 0,
  id: "resource-1",
  parent_id: null,
  workspace_id: "workspace-1",
  resource_type_id: "acme.note",
  schema_version: 1,
  storage_count: 1,
  storage_latest: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  value_count: 0,
  value_latest: null,
  yjs_count: 1,
  yjs_latest: "2026-01-01T00:00:00.000Z:update-1",
  yjs_slot_count: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.indexers = [];
  mocks.queryData = [];
  mocks.resourceTypes = [];
  mocks.runSearchIndexJob.mockResolvedValue(undefined);
  mocks.getSearchIndexRevisions.mockResolvedValue(
    new Map([["acme.note.indexer\u001fresource-1", "revision-1"]])
  );
});

describe("SearchIndexCoordinator readiness", () => {
  it("preserves persisted entries until extension boot is ready", async () => {
    const view = render(<SearchIndexCoordinator enabled={false} />);

    await Promise.resolve();
    expect(mocks.getSearchIndexRevisions).not.toHaveBeenCalled();
    expect(mocks.deleteStaleSearchIndexEntries).not.toHaveBeenCalled();

    view.rerender(<SearchIndexCoordinator enabled />);

    await waitFor(() => {
      expect(mocks.deleteStaleSearchIndexEntries).toHaveBeenCalledWith(
        mocks.database,
        "organization-1",
        new Set(),
        expect.anything()
      );
    });
  });

  it("cancels pending work when hydrated content becomes unavailable", async () => {
    mocks.getSearchIndexRevisions.mockResolvedValue(new Map());
    mocks.indexers = [indexer];
    mocks.queryData = [row];
    mocks.resourceTypes = [definition];
    const view = render(<SearchIndexCoordinator enabled />);

    await waitFor(() => {
      expect(mocks.deleteStaleSearchIndexEntries).toHaveBeenCalledOnce();
    });

    mocks.queryData = [{ ...row, yjs_count: 0, yjs_latest: null }];
    view.rerender(<SearchIndexCoordinator enabled />);

    await waitFor(() => {
      expect(mocks.deleteStaleSearchIndexEntries).toHaveBeenCalledTimes(2);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));

    expect(mocks.runSearchIndexJob).not.toHaveBeenCalled();
  });

  it("invalidates running work when source availability changes", async () => {
    let finishJob: (() => void) | undefined;
    let isCurrent: (() => boolean) | undefined;
    mocks.getSearchIndexRevisions.mockResolvedValue(new Map());
    mocks.indexers = [indexer];
    mocks.queryData = [row];
    mocks.resourceTypes = [definition];
    mocks.runSearchIndexJob.mockImplementation(
      (input: { isCurrent(): boolean }) => {
        isCurrent = input.isCurrent;
        return new Promise<void>((resolve) => {
          finishJob = resolve;
        });
      }
    );
    const view = render(<SearchIndexCoordinator enabled />);

    await waitFor(
      () => {
        expect(mocks.runSearchIndexJob).toHaveBeenCalledOnce();
      },
      { timeout: 1000 }
    );
    expect(isCurrent?.()).toBe(true);

    mocks.queryData = [{ ...row, yjs_count: 0, yjs_latest: null }];
    view.rerender(<SearchIndexCoordinator enabled />);

    await waitFor(() => {
      expect(mocks.deleteStaleSearchIndexEntries).toHaveBeenCalledTimes(2);
    });
    expect(isCurrent?.()).toBe(false);

    finishJob?.();
  });

  it("replaces pending work when source revision changes", async () => {
    mocks.getSearchIndexRevisions.mockResolvedValue(new Map());
    mocks.indexers = [indexer];
    mocks.queryData = [row];
    mocks.resourceTypes = [definition];
    const view = render(<SearchIndexCoordinator enabled />);

    await waitFor(() => {
      expect(mocks.deleteStaleSearchIndexEntries).toHaveBeenCalledOnce();
    });

    const changedRow = {
      ...row,
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    mocks.queryData = [changedRow];
    view.rerender(<SearchIndexCoordinator enabled />);

    await waitFor(() => {
      expect(mocks.deleteStaleSearchIndexEntries).toHaveBeenCalledTimes(2);
    });
    await waitFor(
      () => {
        expect(mocks.runSearchIndexJob).toHaveBeenCalledOnce();
      },
      { timeout: 1000 }
    );
    expect(mocks.runSearchIndexJob.mock.calls[0]?.[0].job.row).toEqual(
      changedRow
    );
  });
});
