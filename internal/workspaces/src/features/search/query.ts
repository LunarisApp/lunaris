export const SEARCH_QUERY_FIELDS = [
  "workspace",
  "title",
  "extension",
  "resource-type",
] as const;

export type SearchQueryField = (typeof SEARCH_QUERY_FIELDS)[number];

export interface SearchQueryTerm {
  exact: boolean;
  field: SearchQueryField | null;
  value: string;
}

export interface ParsedSearchQuery {
  terms: SearchQueryTerm[];
}

export interface SearchQueryFieldCompletion {
  fields: SearchQueryField[];
  from: number;
}

export interface SearchQueryValueCompletion {
  field: SearchQueryField;
  from: number;
  value: string;
}

const SEARCH_QUERY_FIELD_SET = new Set<string>(SEARCH_QUERY_FIELDS);
const SEARCH_QUERY_EXACT_FIELD_COMPLETION_PATTERN = new RegExp(
  `(?:^|\\s)(@(${SEARCH_QUERY_FIELDS.join("|")}))$`,
  "iu"
);
const SEARCH_QUERY_VALUE_COMPLETION_PATTERN = new RegExp(
  `(?:^|\\s)(@?(${SEARCH_QUERY_FIELDS.join("|")}):\\s*(?:"((?:\\\\["\\\\]|[^"])*)|([^\\s"]*)))$`,
  "iu"
);
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

export function normalizeSearchQuery(query: string): string {
  return query.normalize("NFKC").trim().toLowerCase();
}

function readQuotedValue(
  query: string,
  start: number
): { end: number; value: string } | null {
  let value = "";
  let index = start + 1;

  while (index < query.length) {
    const character = query[index];
    if (character === '"') {
      return { end: index + 1, value };
    }
    if (character === "\\") {
      const escaped = query[index + 1];
      if (escaped === '"' || escaped === "\\") {
        value += escaped;
        index += 2;
        continue;
      }
    }
    value += character;
    index += 1;
  }

  return null;
}

function readUnquotedValue(query: string, start: number) {
  let end = start;
  while (end < query.length && !/\s/u.test(query[end] ?? "")) {
    end += 1;
  }
  return { end, value: query.slice(start, end) };
}

function normalizedTerm(
  value: string,
  field: SearchQueryField | null,
  exact: boolean
): SearchQueryTerm | null {
  const normalized = value.normalize("NFKC").trim();
  return normalized ? { exact, field, value: normalized } : null;
}

/** Parses supported filters while leaving unknown or malformed syntax searchable. */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const terms: SearchQueryTerm[] = [];
  let index = 0;

  while (index < query.length) {
    while (index < query.length && /\s/u.test(query[index] ?? "")) {
      index += 1;
    }
    if (index >= query.length) {
      break;
    }

    const termStart = index;
    const fieldMatch = query.slice(index).match(/^@?([\p{L}][\p{L}\p{N}-]*):/u);
    const rawField = fieldMatch?.[1];
    const normalizedField = rawField?.toLowerCase();

    if (
      rawField &&
      normalizedField &&
      SEARCH_QUERY_FIELD_SET.has(normalizedField)
    ) {
      index += fieldMatch[0].length;
      while (index < query.length && /\s/u.test(query[index] ?? "")) {
        index += 1;
      }

      const field = normalizedField as SearchQueryField;
      if (query[index] === '"') {
        const quoted = readQuotedValue(query, index);
        if (quoted) {
          const term = normalizedTerm(quoted.value, field, true);
          if (term) {
            terms.push(term);
          } else {
            const fallback = normalizedTerm(
              query.slice(termStart, quoted.end),
              null,
              false
            );
            if (fallback) {
              terms.push(fallback);
            }
          }
          index = quoted.end;
          continue;
        }
      } else if (index < query.length) {
        const unquoted = readUnquotedValue(query, index);
        const term = normalizedTerm(unquoted.value, field, false);
        if (term) {
          terms.push(term);
          index = unquoted.end;
          continue;
        }
      }

      const fallback = normalizedTerm(query.slice(termStart), null, false);
      if (fallback) {
        terms.push(fallback);
      }
      break;
    }

    if (query[index] === '"') {
      const quoted = readQuotedValue(query, index);
      if (quoted) {
        const term = normalizedTerm(quoted.value, null, true);
        if (term) {
          terms.push(term);
        } else {
          const fallback = normalizedTerm(
            query.slice(index, quoted.end),
            null,
            false
          );
          if (fallback) {
            terms.push(fallback);
          }
        }
        index = quoted.end;
        continue;
      }

      const fallback = normalizedTerm(query.slice(index), null, false);
      if (fallback) {
        terms.push(fallback);
      }
      break;
    }

    const unquoted = readUnquotedValue(query, index);
    const term = normalizedTerm(unquoted.value, null, false);
    if (term) {
      terms.push(term);
    }
    index = unquoted.end;
  }

  return { terms };
}

/** Returns supported fields matching a trailing `@field` completion trigger. */
export function getSearchQueryFieldCompletion(
  query: string
): SearchQueryFieldCompletion | null {
  const trigger = query.match(/(?:^|\s)@([\p{L}\p{N}-]*)$/u);
  if (!trigger) {
    return null;
  }

  const partial = (trigger[1] ?? "").normalize("NFKC").toLowerCase();
  const from = query.lastIndexOf("@");
  if (isInsideQuotedValue(query, from)) {
    return null;
  }

  const fields = SEARCH_QUERY_FIELDS.filter((field) =>
    field.startsWith(partial)
  );

  return fields.length > 0 ? { fields: [...fields], from } : null;
}

function isInsideQuotedValue(query: string, end: number): boolean {
  let quoted = false;
  for (let index = 0; index < end; index += 1) {
    if (query[index] === "\\" && quoted) {
      index += 1;
    } else if (query[index] === '"') {
      quoted = !quoted;
    }
  }
  return quoted;
}

export function completeSearchQueryField(
  query: string,
  completion: SearchQueryFieldCompletion,
  field: SearchQueryField
): string {
  return `${query.slice(0, completion.from)}@${field}:`;
}

/** Returns the active trailing filter value, including quoted partial values. */
export function getSearchQueryValueCompletion(
  query: string
): SearchQueryValueCompletion | null {
  const exactFieldMatch = query.match(
    SEARCH_QUERY_EXACT_FIELD_COMPLETION_PATTERN
  );
  const match =
    exactFieldMatch ?? query.match(SEARCH_QUERY_VALUE_COMPLETION_PATTERN);
  const token = match?.[1];
  const rawField = match?.[2];
  if (!(token && rawField)) {
    return null;
  }

  const from = query.length - token.length;
  if (isInsideQuotedValue(query, from)) {
    return null;
  }

  const field = rawField.toLowerCase() as SearchQueryField;
  const rawValue = exactFieldMatch ? "" : (match[3] ?? match[4] ?? "");
  const value = rawValue.replace(/\\(["\\])/gu, "$1").normalize("NFKC");

  return { field, from, value };
}

export function completeSearchQueryValue(
  query: string,
  completion: SearchQueryValueCompletion,
  value: string
): string {
  const escapedValue = value
    .normalize("NFKC")
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"');
  return `${query.slice(0, completion.from)}@${completion.field}:"${escapedValue}" `;
}

export function getSearchTerms(
  query: ParsedSearchQuery,
  field: SearchQueryField | null
): SearchQueryTerm[] {
  return query.terms.filter((term) => term.field === field);
}

export function hasScopedSearchTerms(query: ParsedSearchQuery): boolean {
  return query.terms.some((term) => term.field !== null);
}

function normalizeWords(value: string): string[] {
  return normalizeSearchQuery(value).match(WORD_PATTERN) ?? [];
}

function includesWordPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  return haystack.some((_, start) =>
    needle.every((word, offset) => haystack[start + offset] === word)
  );
}

type SearchMatch = "prefix" | "substring";

function matchText(value: string, needle: string): SearchMatch | undefined {
  const normalized = normalizeSearchQuery(value);
  const first = normalized.indexOf(needle);
  for (
    let index = first;
    index !== -1;
    index = normalized.indexOf(needle, index + 1)
  ) {
    if (
      index === 0 ||
      !/^[\p{L}\p{M}\p{N}]/u.test(needle) ||
      !/[\p{L}\p{M}\p{N}]$/u.test(normalized.slice(0, index))
    ) {
      return "prefix";
    }
  }
  return first === -1 ? undefined : "substring";
}

export function matchesSearchPrefix(value: string, needle: string): boolean {
  return matchText(value, needle) === "prefix";
}

export function getSearchMatchRank(
  values: readonly string[],
  query: string
): number {
  const needle = normalizeSearchQuery(query);
  if (!needle) {
    return 0;
  }
  return Math.min(
    ...values.map((value) => {
      const normalizedValue = normalizeSearchQuery(value);
      if (normalizedValue === needle) {
        return 0;
      }
      if (normalizedValue.startsWith(needle)) {
        return 1;
      }
      if (matchesSearchPrefix(value, needle)) {
        return 2;
      }
      return 3;
    })
  );
}

function getTermMatch(
  values: readonly string[],
  term: SearchQueryTerm
): SearchMatch | undefined {
  if (term.exact) {
    const needle = normalizeWords(term.value);
    return values.some((value) =>
      includesWordPhrase(normalizeWords(value), needle)
    )
      ? "prefix"
      : undefined;
  }

  const needle = normalizeSearchQuery(term.value);
  if (!needle) {
    return;
  }
  let best: SearchMatch | undefined;
  for (const value of values) {
    const match = matchText(value, needle);
    if (match === "prefix") {
      return match;
    }
    best ??= match;
  }
  return best;
}

export function matchesSearchTerm(
  values: readonly string[],
  term: SearchQueryTerm
): boolean {
  return getTermMatch(values, term) === "prefix";
}

export function matchesSearchTerms(
  values: readonly string[],
  terms: readonly SearchQueryTerm[]
): boolean {
  return terms.every((term) => matchesSearchTerm(values, term));
}

/** A fallback still requires every term. Quoted phrases always match whole words. */
export function getSearchMatch(
  values: readonly string[],
  terms: readonly SearchQueryTerm[]
): SearchMatch | undefined {
  let best: SearchMatch = "prefix";
  for (const term of terms) {
    const match = getTermMatch(values, term);
    if (!match) {
      return;
    }
    if (match === "substring") {
      best = match;
    }
  }
  return best;
}
