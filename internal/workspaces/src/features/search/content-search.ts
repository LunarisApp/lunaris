import type { ResourceSearchResult } from "./types";

export function filterDuplicateContentResults(
  contentResults: ResourceSearchResult[],
  resourceResults: ResourceSearchResult[]
): ResourceSearchResult[] {
  const titleMatchIds = new Set(
    resourceResults.map((result) => result.resourceId)
  );

  return contentResults.filter(
    (result) => !titleMatchIds.has(result.resourceId)
  );
}
