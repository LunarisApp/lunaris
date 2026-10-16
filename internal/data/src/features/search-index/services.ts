import type { DatabaseOrTx } from "../../core/utils";
import { SEARCH_INDEX_ENTRIES_TABLE, SEARCH_INDEX_FTS_TABLE } from "./setup";

export const SEARCH_INDEX_RESULT_LIMIT = 50;

export interface SearchIndexEntry {
  content: string;
  entryKey: string;
  indexedAt: string;
  indexerId: string;
  organizationId: string;
  resourceId: string;
  resourceTypeId: string;
  sourceRevision: string;
  workspaceId: string;
}

export interface SearchIndexResultRow {
  preview: string;
  rank: number;
  resource_id: string;
  resource_name: string | null;
  resource_type_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_slug: string | null;
}

export interface SearchSnippet {
  highlights: Array<{ end: number; start: number }>;
  text: string;
}

export interface SearchIndexTextTerm {
  exact: boolean;
  value: string;
}

export interface SearchIndexQueryInput {
  organizationId: string;
  resourceIds?: readonly string[];
  resourceTypeIds?: readonly string[];
  terms: readonly SearchIndexTextTerm[];
  workspaceIds?: readonly string[];
}

export function searchIndexEntryKey(
  indexerId: string,
  resourceId: string
): string {
  return `${indexerId}\u001f${resourceId}`;
}

export function buildSearchMatchQuery(
  terms: readonly SearchIndexTextTerm[]
): string | null {
  const fragments: string[] = [];
  let remainingTokens = 10;

  for (const term of terms) {
    if (remainingTokens === 0) {
      break;
    }
    const tokens = (term.value.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])
      .slice(0, remainingTokens)
      .map((token) => [...token].slice(0, 64).join(""));
    if (tokens.length === 0) {
      continue;
    }
    remainingTokens -= tokens.length;

    if (term.exact) {
      fragments.push(JSON.stringify(tokens.join(" ")));
    } else {
      fragments.push(...tokens.map((token) => `${JSON.stringify(token)}*`));
    }
  }

  return fragments.length > 0 ? fragments.join(" AND ") : null;
}

function hasEmptyFilter(values: readonly string[] | undefined): boolean {
  return values !== undefined && values.length === 0;
}

function addBoundListFilter(
  filters: string[],
  params: unknown[],
  column: string,
  values: readonly string[] | undefined
): void {
  if (!values) {
    return;
  }
  filters.push(`${column} IN (SELECT value FROM json_each(?))`);
  params.push(JSON.stringify(values));
}

export function buildSearchIndexQuery(input: SearchIndexQueryInput) {
  const { workspaceIds, resourceIds, resourceTypeIds, terms, organizationId } =
    input;
  const match = buildSearchMatchQuery(terms);
  if (
    !(match && organizationId) ||
    hasEmptyFilter(workspaceIds) ||
    hasEmptyFilter(resourceIds) ||
    hasEmptyFilter(resourceTypeIds)
  ) {
    return null;
  }

  const filters = [
    `${SEARCH_INDEX_FTS_TABLE} MATCH ?`,
    "entries.organization_id = ?",
  ];
  const params: unknown[] = [match, organizationId];
  addBoundListFilter(filters, params, "entries.workspace_id", workspaceIds);
  addBoundListFilter(filters, params, "entries.resource_id", resourceIds);
  addBoundListFilter(
    filters,
    params,
    "entries.resource_type_id",
    resourceTypeIds
  );
  params.push(SEARCH_INDEX_RESULT_LIMIT);

  return {
    params,
    sql: `
      WITH ranked AS (
        SELECT
          entries.workspace_id,
          entries.resource_id,
          entries.resource_type_id,
          bm25(${SEARCH_INDEX_FTS_TABLE}) AS rank,
          snippet(${SEARCH_INDEX_FTS_TABLE}, 0, char(1), char(2), '…', 20) AS preview
        FROM ${SEARCH_INDEX_FTS_TABLE}
        INNER JOIN ${SEARCH_INDEX_ENTRIES_TABLE} entries
          ON entries.rowid = ${SEARCH_INDEX_FTS_TABLE}.rowid
        WHERE ${filters.join("\n          AND ")}
      ), deduplicated AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY resource_id ORDER BY rank ASC
        ) AS resource_match
        FROM ranked
      ), resources AS (
        SELECT resources.* FROM workspace_resources resources
        WHERE NOT EXISTS (
          SELECT 1 FROM workspace_resource_trash trash WHERE trash.id = resources.id
        )
        UNION ALL
        SELECT resources.* FROM local_workspace_resources resources
        WHERE NOT EXISTS (
          SELECT 1 FROM local_workspace_resource_trash trash WHERE trash.id = resources.id
        )
      ), workspaces_union AS (
        SELECT * FROM workspaces
        UNION ALL
        SELECT * FROM local_workspaces
      )
      SELECT
        matches.preview,
        matches.workspace_id,
        workspaces_union.name AS workspace_name,
        workspaces_union.slug AS workspace_slug,
        matches.rank,
        matches.resource_id,
        resources.name AS resource_name,
        matches.resource_type_id
      FROM deduplicated matches
      INNER JOIN resources
        ON resources.id = matches.resource_id
        AND resources.workspace_id = matches.workspace_id
      INNER JOIN workspaces_union ON workspaces_union.id = matches.workspace_id
      WHERE matches.resource_match = 1
      ORDER BY matches.rank ASC, resources.name COLLATE NOCASE ASC
      LIMIT ?
    `,
  };
}

export function parseSearchSnippet(value: string): SearchSnippet {
  let text = "";
  let start: number | null = null;
  const highlights: SearchSnippet["highlights"] = [];
  for (const character of value) {
    if (character === "\u0001") {
      start = text.length;
    } else if (character === "\u0002") {
      if (start !== null && start < text.length) {
        highlights.push({ end: text.length, start });
      }
      start = null;
    } else {
      text += character;
    }
  }
  return { highlights, text };
}

export async function getSearchIndexRevisions(
  db: DatabaseOrTx,
  organizationId: string
): Promise<Map<string, string>> {
  const rows = await db.getAll<{ entry_key: string; source_revision: string }>(
    `SELECT entry_key, source_revision FROM ${SEARCH_INDEX_ENTRIES_TABLE}
     WHERE organization_id = ?`,
    [organizationId]
  );
  return new Map(rows.map((row) => [row.entry_key, row.source_revision]));
}

export async function upsertSearchIndexEntry(
  db: DatabaseOrTx,
  entry: SearchIndexEntry
): Promise<void> {
  await db.execute(
    `INSERT INTO ${SEARCH_INDEX_ENTRIES_TABLE} (
      entry_key, organization_id, workspace_id, resource_id,
      resource_type_id, indexer_id, source_revision, content, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entry_key) DO UPDATE SET
      organization_id = excluded.organization_id,
      workspace_id = excluded.workspace_id,
      resource_id = excluded.resource_id,
      resource_type_id = excluded.resource_type_id,
      indexer_id = excluded.indexer_id,
      source_revision = excluded.source_revision,
      content = excluded.content,
      indexed_at = excluded.indexed_at`,
    [
      entry.entryKey,
      entry.organizationId,
      entry.workspaceId,
      entry.resourceId,
      entry.resourceTypeId,
      entry.indexerId,
      entry.sourceRevision,
      entry.content,
      entry.indexedAt,
    ]
  );
}

export async function deleteSearchIndexEntry(
  db: DatabaseOrTx,
  entryKey: string,
  expected?: { indexedAt: string; sourceRevision: string }
): Promise<void> {
  await db.execute(
    `DELETE FROM ${SEARCH_INDEX_ENTRIES_TABLE} WHERE entry_key = ?${
      expected ? " AND source_revision = ? AND indexed_at = ?" : ""
    }`,
    expected
      ? [entryKey, expected.sourceRevision, expected.indexedAt]
      : [entryKey]
  );
}

export async function deleteStaleSearchIndexEntries(
  db: DatabaseOrTx,
  organizationId: string,
  activeEntryKeys: ReadonlySet<string>,
  existingEntryKeys: Iterable<string>
): Promise<void> {
  if (!activeEntryKeys.size) {
    await db.execute(
      `DELETE FROM ${SEARCH_INDEX_ENTRIES_TABLE} WHERE organization_id = ?`,
      [organizationId]
    );
    return;
  }
  const staleKeys = [...existingEntryKeys].filter(
    (entryKey) => !activeEntryKeys.has(entryKey)
  );
  for (let offset = 0; offset < staleKeys.length; offset += 400) {
    const chunk = staleKeys.slice(offset, offset + 400);
    await db.execute(
      `DELETE FROM ${SEARCH_INDEX_ENTRIES_TABLE}
       WHERE organization_id = ? AND entry_key IN (${chunk.map(() => "?").join(", ")})`,
      [organizationId, ...chunk]
    );
  }
}
