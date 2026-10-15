import type {
  RegisteredSearchIndexer,
  ResourceTypeContribution,
} from "@lunarisapp/plugin-sdk";
import { describe, expect, it } from "vitest";
import { enqueueSearchIndexReconciliation } from "./search-index-coordinator";
import {
  type IndexableResourceRow,
  planSearchIndexUpdates,
} from "./search-index-runtime";

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

describe("search index reconciliation queue", () => {
  it("serializes reconciliations for one database", async () => {
    const database = {};
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = enqueueSearchIndexReconciliation(database, async () => {
      events.push("first:start");
      markFirstStarted?.();
      await firstGate;
      events.push("first:end");
    });
    const second = enqueueSearchIndexReconciliation(database, async () => {
      events.push("second:start");
    });

    await firstStarted;
    expect(events).toEqual(["first:start"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });
});

describe("search index update planning", () => {
  it("plans matching changed resources and skips unchanged revisions", () => {
    const definitions = new Map([[definition.resourceTypeId, definition]]);
    const initial = planSearchIndexUpdates(
      [row],
      definitions,
      [indexer],
      new Map(),
    );

    expect(initial.activeEntryKeys).toEqual(
      new Set(["acme.note.indexer\u001fresource-1"]),
    );
    expect(initial.entryStates.get("acme.note.indexer\u001fresource-1")).toEqual({
      available: true,
      revision: initial.jobs[0]?.revision,
    });
    expect(initial.jobs).toHaveLength(1);
    expect(initial.jobs[0]?.resource).toMatchObject({
      resourceId: "resource-1",
      schemaId: "acme.note.schema",
    });

    const unchanged = planSearchIndexUpdates(
      [row],
      definitions,
      [indexer],
      new Map([[initial.jobs[0]?.entryKey ?? "", initial.jobs[0]?.revision ?? ""]]),
    );
    expect(unchanged.jobs).toEqual([]);
  });

  it("retains active keys while hydrated content is unavailable", () => {
    const unavailable = planSearchIndexUpdates(
      [{ ...row, yjs_count: 0, yjs_latest: null }],
      new Map([[definition.resourceTypeId, definition]]),
      [indexer],
      new Map(),
    );

    expect(unavailable.activeEntryKeys.size).toBe(1);
    expect(
      unavailable.entryStates.get("acme.note.indexer\u001fresource-1")?.available,
    ).toBe(false);
    expect(unavailable.jobs).toEqual([]);
  });
});
