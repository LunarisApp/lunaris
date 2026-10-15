import { describe, expect, it } from "vitest";
import {
  completeSearchQueryField,
  completeSearchQueryValue,
  getSearchQueryFieldCompletion,
  getSearchQueryValueCompletion,
  matchesSearchTerm,
  matchesSearchTerms,
  parseSearchQuery,
} from "./query";

describe("parseSearchQuery", () => {
  it("parses scoped, unscoped, and quoted terms", () => {
    expect(
      parseSearchQuery(
        'WORKSPACE: "Demo Organization" title:Roadmap extension:lunaris.kanban resource-type:"Kanban Board" migration',
      ),
    ).toEqual({
      terms: [
        { exact: true, field: "workspace", value: "Demo Organization" },
        { exact: false, field: "title", value: "Roadmap" },
        { exact: false, field: "extension", value: "lunaris.kanban" },
        { exact: true, field: "resource-type", value: "Kanban Board" },
        { exact: false, field: null, value: "migration" },
      ],
    });
  });

  it("accepts whitespace before quoted or unquoted field values", () => {
    expect(parseSearchQuery('@workspace: Demo title: "Q4 Plan"')).toEqual({
      terms: [
        { exact: false, field: "workspace", value: "Demo" },
        { exact: true, field: "title", value: "Q4 Plan" },
      ],
    });
  });

  it("accepts Railway-style @ field prefixes", () => {
    expect(parseSearchQuery('@WORKSPACE:"Demo" @resource-type:kanban')).toEqual({
      terms: [
        { exact: true, field: "workspace", value: "Demo" },
        { exact: false, field: "resource-type", value: "kanban" },
      ],
    });
  });

  it("supports escaped quotes and backslashes", () => {
    expect(parseSearchQuery('title:"A \\"quote\\" \\\\ draft"')).toEqual({
      terms: [
        {
          exact: true,
          field: "title",
          value: 'A "quote" \\ draft',
        },
      ],
    });
  });

  it("normalizes Unicode without lowercasing stored values", () => {
    expect(parseSearchQuery('title:"Ｃafé"')).toEqual({
      terms: [{ exact: true, field: "title", value: "Café" }],
    });
  });

  it("leaves unknown and malformed syntax unscoped", () => {
    expect(parseSearchQuery("owner:alice @owner:bob workspace:")).toEqual({
      terms: [
        { exact: false, field: null, value: "owner:alice" },
        { exact: false, field: null, value: "@owner:bob" },
        { exact: false, field: null, value: "workspace:" },
      ],
    });
    expect(parseSearchQuery('title:"unfinished phrase')).toEqual({
      terms: [
        {
          exact: false,
          field: null,
          value: 'title:"unfinished phrase',
        },
      ],
    });
    expect(parseSearchQuery('workspace:""')).toEqual({
      terms: [{ exact: false, field: null, value: 'workspace:""' }],
    });
    expect(parseSearchQuery('"" "')).toEqual({
      terms: [
        { exact: false, field: null, value: '""' },
        { exact: false, field: null, value: '"' },
      ],
    });
  });
});

describe("search query field completion", () => {
  it("suggests fields for a trailing @ trigger", () => {
    expect(getSearchQueryFieldCompletion("roadmap @wor")).toEqual({
      fields: ["workspace"],
      from: 8,
    });
    expect(getSearchQueryFieldCompletion("@")).toEqual({
      fields: ["workspace", "title", "extension", "resource-type"],
      from: 0,
    });
  });

  it("ignores embedded and unknown triggers", () => {
    expect(getSearchQueryFieldCompletion("email@example.com")).toBeNull();
    expect(getSearchQueryFieldCompletion("@owner")).toBeNull();
    expect(getSearchQueryFieldCompletion('"hello @wor')).toBeNull();
  });

  it("suggests after closed and escaped quoted phrases", () => {
    expect(
      getSearchQueryFieldCompletion('title:"Road \\"map\\"" @EXT'),
    ).toEqual({
      fields: ["extension"],
      from: 21,
    });
  });

  it("replaces the active trigger with valid syntax", () => {
    const completion = getSearchQueryFieldCompletion("roadmap @wor");
    expect(completion).not.toBeNull();
    if (!completion) return;
    expect(
      completeSearchQueryField("roadmap @wor", completion, "workspace"),
    ).toBe("roadmap @workspace:");
  });
});

describe("search query value completion", () => {
  it("reads empty, unquoted, and quoted partial values", () => {
    expect(getSearchQueryValueCompletion("@workspace")).toEqual({
      field: "workspace",
      from: 0,
      value: "",
    });
    expect(getSearchQueryValueCompletion("@workspace:")).toEqual({
      field: "workspace",
      from: 0,
      value: "",
    });
    expect(getSearchQueryValueCompletion("roadmap @workspace:dem")).toEqual({
      field: "workspace",
      from: 8,
      value: "dem",
    });
    expect(getSearchQueryValueCompletion('@title:"Road \\"map')).toEqual({
      field: "title",
      from: 0,
      value: 'Road "map',
    });
  });

  it("ignores completed values and filters inside open phrases", () => {
    expect(getSearchQueryValueCompletion('@workspace:"Demo"')).toBeNull();
    expect(getSearchQueryValueCompletion("@workspace:Demo ")).toBeNull();
    expect(getSearchQueryValueCompletion('"notes @workspace:Demo')).toBeNull();
  });

  it("inserts a quoted value and preserves preceding terms", () => {
    const completion = getSearchQueryValueCompletion("roadmap @workspace:dem");
    expect(completion).not.toBeNull();
    if (!completion) return;
    expect(
      completeSearchQueryValue(
        "roadmap @workspace:dem",
        completion,
        'Demo "North" \\ archive',
      ),
    ).toBe('roadmap @workspace:"Demo \\"North\\" \\\\ archive" ');
  });
});

describe("matchesSearchTerm", () => {
  it("matches unquoted terms as case-insensitive substrings", () => {
    expect(
      matchesSearchTerm(["Quarterly Roadmap"], {
        exact: false,
        field: null,
        value: "ROAD",
      }),
    ).toBe(true);
  });

  it("matches quoted terms as contiguous case-insensitive words", () => {
    const term = { exact: true, field: null, value: "Q4 plan" } as const;
    expect(matchesSearchTerm(["Draft: q4-plan review"], term)).toBe(true);
    expect(matchesSearchTerm(["Q4 migration plan"], term)).toBe(false);
    expect(matchesSearchTerm(["AQ4 planX"], term)).toBe(false);
  });

  it("requires every term to match", () => {
    expect(
      matchesSearchTerms(
        ["Quarterly Roadmap"],
        [
          { exact: false, field: null, value: "quarter" },
          { exact: false, field: null, value: "map" },
        ],
      ),
    ).toBe(true);
    expect(
      matchesSearchTerms(
        ["Quarterly Roadmap"],
        [
          { exact: false, field: null, value: "quarter" },
          { exact: false, field: null, value: "budget" },
        ],
      ),
    ).toBe(false);
  });
});
