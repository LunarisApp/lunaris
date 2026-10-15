import { describe, expect, it, vi } from "vitest";
import { configureSearchIndex } from "./setup";

describe("configureSearchIndex", () => {
  it("creates external-content FTS and triggers, then records its schema", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const db = {
      execute,
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue(null),
      writeTransaction: async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute }),
    };

    await configureSearchIndex(db as never);

    const sql = execute.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("USING fts5");
    expect(sql).toContain("content='search_index_entries'");
    expect(sql).toContain("remove_diacritics 2");
    expect(sql).toContain("search_index_entries_ai");
    expect(sql).toContain("VALUES ('rebuild')");
  });

  it("is idempotent when the current FTS schema exists", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const db = {
      execute,
      getAll: vi.fn().mockResolvedValue([
        { name: "search_index_entries", type: "table" },
        { name: "search_index_fts", type: "table" },
        { name: "search_index_entries_ai", type: "trigger" },
        { name: "search_index_entries_au", type: "trigger" },
        { name: "search_index_entries_ad", type: "trigger" },
      ]),
      getOptional: vi.fn().mockResolvedValue({ value: "2" }),
      writeTransaction: async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute }),
    };

    await configureSearchIndex(db as never);

    const sql = execute.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("VALUES ('rebuild')");
  });

  it("rebuilds when a trigger is missing", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const db = {
      execute,
      getAll: vi.fn().mockResolvedValue([
        { name: "search_index_entries", type: "table" },
        { name: "search_index_fts", type: "table" },
        { name: "search_index_entries_ai", type: "trigger" },
        { name: "search_index_entries_ad", type: "trigger" },
      ]),
      getOptional: vi.fn().mockResolvedValue({ value: "1" }),
      writeTransaction: async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute }),
    };

    await configureSearchIndex(db as never);

    const sql = execute.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("DROP TABLE IF EXISTS search_index_fts");
    expect(sql).toContain("VALUES ('rebuild')");
  });
});
