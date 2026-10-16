import type {
  RegisteredSearchIndexer,
  ResourceTypeContribution,
} from "@lunarisapp/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type IndexableResourceRow,
  planSearchIndexUpdates,
  runSearchIndexJob,
} from "./search-index-runtime";

const mocks = vi.hoisted(() => ({
  upsertSearchIndexEntry: vi.fn(),
}));

vi.mock("@repo/data/features/search-index", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@repo/data/features/search-index")
  >()),
  upsertSearchIndexEntry: mocks.upsertSearchIndexEntry,
}));

const definition = {
  resourceTypeId: "acme.note",
  schema: {
    id: "acme.note.schema",
    read: () => ({ text: "payload" }),
    versions: {
      1: {
        "~standard": {
          validate: (value: unknown) => ({ value }),
        },
      },
    },
  },
  storage: {},
} as unknown as ResourceTypeContribution;

const extractText =
  vi.fn<RegisteredSearchIndexer["definition"]["extractText"]>();
const indexer = {
  definition: {
    extractText,
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
  storage_count: 0,
  storage_latest: null,
  updated_at: "2026-01-01T00:00:00.000Z",
  value_count: 0,
  value_latest: null,
  yjs_count: 0,
  yjs_latest: null,
  yjs_slot_count: 0,
};

function createJob() {
  const plan = planSearchIndexUpdates(
    [row],
    new Map([[definition.resourceTypeId, definition]]),
    [indexer],
    new Map()
  );
  const job = plan.jobs[0];
  if (!job) {
    throw new Error("Expected search index job");
  }
  return job;
}

async function runWithCurrentRow(currentRow: IndexableResourceRow | null) {
  const db = {
    getAll: vi.fn().mockResolvedValue([]),
    getOptional: vi.fn().mockResolvedValue(currentRow),
  };
  await runSearchIndexJob({
    db: db as never,
    isCurrent: () => true,
    job: createJob(),
    organizationId: "organization-1",
  });
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("search index job source guards", () => {
  it("skips mutations when source disappears during extraction", async () => {
    extractText.mockResolvedValue("indexed text");

    await runWithCurrentRow(null);

    expect(mocks.upsertSearchIndexEntry).not.toHaveBeenCalled();
  });

  it("skips mutations when source revision changes during extraction", async () => {
    extractText.mockResolvedValue("indexed text");

    await runWithCurrentRow({
      ...row,
      updated_at: "2026-01-02T00:00:00.000Z",
    });

    expect(mocks.upsertSearchIndexEntry).not.toHaveBeenCalled();
  });

  it("records the revision when stable available source extracts blank text", async () => {
    extractText.mockResolvedValue(null);

    await runWithCurrentRow(row);

    expect(mocks.upsertSearchIndexEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "",
        entryKey: "acme.note.indexer\u001fresource-1",
        sourceRevision: createJob().revision,
      })
    );
  });

  it("upserts text when source remains available at planned revision", async () => {
    extractText.mockResolvedValue("indexed text");

    await runWithCurrentRow(row);

    expect(mocks.upsertSearchIndexEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "indexed text",
        resourceId: "resource-1",
        organizationId: "organization-1",
      })
    );
  });

  it("preserves a stable commit when scheduler invalidates after writing", async () => {
    let current = true;
    extractText.mockResolvedValue("indexed text");
    mocks.upsertSearchIndexEntry.mockImplementation(async () => {
      current = false;
    });
    const db = {
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue(row),
    };

    await runSearchIndexJob({
      db: db as never,
      isCurrent: () => current,
      job: createJob(),
      organizationId: "organization-1",
    });

    expect(mocks.upsertSearchIndexEntry).toHaveBeenCalledOnce();
  });
});
