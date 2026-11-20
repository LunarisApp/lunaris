import {
  getSearchTerms,
  getSearchMatchRank,
  getSearchMatch,
  parseSearchQuery,
} from "./query";
import type { WorkspaceSearchResult } from "./types";

export interface SearchableWorkspace {
  id: string;
  name?: string | null;
  slug?: string | null;
}

export function searchWorkspaces(
  workspaces: SearchableWorkspace[],
  query: string,
  currentWorkspaceId: string,
  untitledLabel: string,
  options: {
    excludeCurrentWorkspace?: boolean;
    includeAllWhenEmpty?: boolean;
    limit?: number;
  } = {}
): WorkspaceSearchResult[] {
  const parsedQuery = parseSearchQuery(query);
  const workspaceTerms = getSearchTerms(parsedQuery, "workspace");
  const unscopedTerms = getSearchTerms(parsedQuery, null);
  const hasOtherFilters = parsedQuery.terms.some(
    (term) => term.field !== null && term.field !== "workspace"
  );
  if (
    hasOtherFilters ||
    (workspaceTerms.length > 0 && unscopedTerms.length > 0)
  ) {
    return [];
  }

  const terms = workspaceTerms.length > 0 ? workspaceTerms : unscopedTerms;
  if (terms.length === 0 && !options.includeAllWhenEmpty) {
    return [];
  }
  const preserveSourceOrder = terms.length === 0;
  const rankQuery = terms[0]?.value ?? "";

  const results = workspaces
    .flatMap((workspace) => {
      if (!workspace.slug) {
        return [];
      }

      const label = workspace.name || untitledLabel;
      const match = getSearchMatch([label, workspace.slug], terms);
      if (!match || (match === "substring" && workspaceTerms.length > 0)) {
        return [];
      }

      return {
        result: {
          ...(match === "substring" && { substringMatch: true }),
          id: `workspace-${workspace.id}`,
          isCurrent: workspace.id === currentWorkspaceId,
          label,
          workspaceId: workspace.id,
          slug: workspace.slug,
          type: "workspace" as const,
        },
        rank: getSearchMatchRank([label, workspace.slug], rankQuery),
      };
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        (preserveSourceOrder
          ? 0
          : left.result.label.localeCompare(right.result.label, undefined, {
              numeric: true,
              sensitivity: "base",
            }))
    )
    .map(({ result }) => result)
    .filter((result) =>
      options.excludeCurrentWorkspace ? !result.isCurrent : true
    );

  return options.limit === undefined
    ? results
    : results.slice(0, options.limit);
}
