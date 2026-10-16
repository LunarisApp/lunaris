"use client";

import { useOrganizationWorkspaceResourcesQuery } from "@repo/data/features/workspace-resources";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchScope } from "../scope";
import { getSearchableResources, searchResourcesByTitle } from "../resources";
import type { ResourceSearchResult } from "../types";
import { useSearchResourceTypes } from "./useSearchResourceTypes";

/**
 * Hook to search resources by title with debounced filtering.
 * Fetches workspace resources and filters them case-insensitively.
 *
 * @param query - Search query string
 * @param debounceMs - Debounce delay in milliseconds (default: 150)
 * @param options - Completion behavior
 */
export function useResourceSearch(
  query: string,
  debounceMs = 150,
  options: { includeAllWhenEmpty?: boolean } = {}
): ResourceSearchResult[] {
  const includeAllWhenEmpty = options.includeAllWhenEmpty ?? false;
  const { t } = useTranslation();
  const { organizationId } = useSearchScope();
  const resourceTypes = useSearchResourceTypes();
  const resourcesQuery = useOrganizationWorkspaceResourcesQuery(organizationId);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const resources = useMemo(
    () =>
      getSearchableResources(
        resourcesQuery.data ?? [],
        t("common.untitled"),
        resourceTypes
      ),
    [resourcesQuery.data, resourceTypes, t]
  );
  const searchQuery = includeAllWhenEmpty ? query : debouncedQuery;
  const results = useMemo(
    () =>
      searchResourcesByTitle(resources, searchQuery, {
        includeAllWhenEmpty,
      }),
    [resources, includeAllWhenEmpty, searchQuery]
  );

  return query.trim() || includeAllWhenEmpty ? results : [];
}
