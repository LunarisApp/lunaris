import { describe, expect, it, vi } from "vitest";
import {
  buildSearchIndexQuery,
  buildSearchMatchQuery,
  deleteStaleSearchIndexEntries,
  parseSearchSnippet,
  searchIndexEntryKey,
} from "./services";

describe("search index services", () => {
  it("builds bound prefix queries from Unicode words", () => {
    expect(
      buildSearchMatchQuery([{ exact: false, value: " Héllo, 世界! " }])
    ).toBe('"Héllo"* AND "世界"*');
    expect(buildSearchMatchQuery([{ exact: false, value: "!?--" }])).toBeNull();
    expect(
      buildSearchMatchQuery([{ exact: false, value: "𐐀".repeat(65) }])
    ).toBe(`"${"𐐀".repeat(64)}"*`);
  });

  it("keeps quoted terms as exact FTS phrases", () => {
    expect(
      buildSearchMatchQuery([
        { exact: true, value: "quarterly plan" },
        { exact: false, value: "road" },
      ])
    ).toBe('"quarterly plan" AND "road"*');
  });

  it("caps FTS input at ten tokens", () => {
    expect(
      buildSearchMatchQuery([
        {
          exact: false,
          value: "one two three four five six seven eight nine ten eleven",
        },
      ])?.split(" AND ")
    ).toHaveLength(10);
  });

  it("binds match, organization, and result limit", () => {
    const query = buildSearchIndexQuery({
      terms: [{ exact: false, value: "road map" }],
      organizationId: "organization-1",
    });
    expect(query?.params).toEqual(['"road"* AND "map"*', "organization-1", 50]);
    expect(query?.sql).toContain("PARTITION BY resource_id");
    expect(query?.sql).toContain("bm25(search_index_fts)");
  });

  it("binds workspace and resource filters before the result limit", () => {
    const query = buildSearchIndexQuery({
      workspaceIds: ["workspace-1"],
      resourceIds: ["resource-1", "resource-2"],
      resourceTypeIds: ["acme.note"],
      terms: [{ exact: true, value: "road map" }],
      organizationId: "organization-1",
    });

    expect(query?.params).toEqual([
      '"road map"',
      "organization-1",
      '["workspace-1"]',
      '["resource-1","resource-2"]',
      '["acme.note"]',
      50,
    ]);
    expect(query?.sql).toContain(
      "entries.workspace_id IN (SELECT value FROM json_each(?))"
    );
    expect(query?.sql).toContain(
      "entries.resource_id IN (SELECT value FROM json_each(?))"
    );
    expect(query?.sql).toContain(
      "entries.resource_type_id IN (SELECT value FROM json_each(?))"
    );
  });

  it("binds large filter lists as one JSON parameter", () => {
    const resourceIds = Array.from(
      { length: 1200 },
      (_, index) => `resource-${index}`
    );
    const query = buildSearchIndexQuery({
      resourceIds,
      terms: [{ exact: false, value: "road" }],
      organizationId: "organization-1",
    });

    expect(query?.params).toHaveLength(4);
    expect(query?.params[2]).toBe(JSON.stringify(resourceIds));
  });

  it("skips queries whose resolved filters have no matches", () => {
    expect(
      buildSearchIndexQuery({
        workspaceIds: [],
        terms: [{ exact: false, value: "road" }],
        organizationId: "organization-1",
      })
    ).toBeNull();
  });

  it("parses FTS highlight markers into safe ranges", () => {
    expect(parseSearchSnippet("…a\u0001match\u0002 b\u0001two\u0002…")).toEqual(
      {
        highlights: [
          { end: 7, start: 2 },
          { end: 12, start: 9 },
        ],
        text: "…amatch btwo…",
      }
    );
  });

  it("uses stable resource/indexer keys and bound cleanup", async () => {
    expect(searchIndexEntryKey("indexer", "resource")).toBe(
      "indexer\u001fresource"
    );
    const execute = vi.fn().mockResolvedValue(undefined);
    await deleteStaleSearchIndexEntries(
      { execute } as never,
      "organization-1",
      new Set(["entry-1"]),
      ["entry-1", "entry-2"]
    );
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("IN (?)"), [
      "organization-1",
      "entry-2",
    ]);
  });
});
