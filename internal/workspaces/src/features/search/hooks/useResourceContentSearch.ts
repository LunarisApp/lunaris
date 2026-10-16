"use client";

import {
  SYNC_ACCESS,
  usePowerSync,
  useQuery,
  useSyncAccess,
} from "@repo/data/core";
import { useOrganizationWorkspaceResourcesQuery } from "@repo/data/features/workspace-resources";
import {
  buildSearchIndexQuery,
  parseSearchSnippet,
  type SearchIndexResultRow,
} from "@repo/data/features/search-index";
import { log, parseError } from "evlog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchScope } from "../scope";
import {
  getCloudContentWorkspaceIds,
  getSearchableResources,
  matchesResourceFilters,
} from "../resources";
import { getSearchTerms, parseSearchQuery } from "../query";
import type { ResourceSearchResult } from "../types";
import { useSearchResourceTypes } from "./useSearchResourceTypes";

const EMPTY_SEARCH_QUERY = `
  SELECT NULL AS preview, NULL AS workspace_id,
    NULL AS workspace_name, NULL AS workspace_slug, NULL AS rank,
    NULL AS resource_id, NULL AS resource_name, NULL AS resource_type_id
  WHERE 0
`;

/** Searches the host-owned device-local FTS index. */
export function useResourceContentSearch(
  query: string,
  debounceMs = 300,
  enabled = true
): ResourceSearchResult[] {
  const { t } = useTranslation();
  const db = usePowerSync();
  const syncAccess = useSyncAccess();
  const { organizationId, workspaceId } = useSearchScope();
  const resourceTypes = useSearchResourceTypes();
  const resourcesQuery = useOrganizationWorkspaceResourcesQuery(organizationId);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, query]);

  const resources = useMemo(
    () =>
      getSearchableResources(
        resourcesQuery.data ?? [],
        t("common.untitled"),
        resourceTypes
      ),
    [resourcesQuery.data, resourceTypes, t]
  );
  const parsedQuery = useMemo(
    () => parseSearchQuery(debouncedQuery),
    [debouncedQuery]
  );
  const immediateQuery = useMemo(() => parseSearchQuery(query), [query]);
  const unscopedTerms = useMemo(
    () => getSearchTerms(parsedQuery, null),
    [parsedQuery]
  );
  const filteredResources = useMemo(
    () =>
      resources.filter((resource) =>
        matchesResourceFilters(resource, parsedQuery)
      ),
    [resources, parsedQuery]
  );
  const otherWorkspaceIds = useMemo(
    () => getCloudContentWorkspaceIds(filteredResources, workspaceId),
    [filteredResources, workspaceId]
  );
  const isSearchActive =
    enabled &&
    unscopedTerms.length > 0 &&
    getSearchTerms(immediateQuery, null).length > 0;
  const shouldHydrateContent =
    enabled && (parsedQuery.terms.length === 0 || unscopedTerms.length > 0);

  useEffect(() => {
    if (
      !shouldHydrateContent ||
      syncAccess !== SYNC_ACCESS.cloud ||
      otherWorkspaceIds.length === 0
    ) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const subscriptions: Array<{ unsubscribe: () => void }> = [];

    void Promise.allSettled(
      otherWorkspaceIds.map(async (otherWorkspaceId) => {
        const subscription = await db
          .syncStream("workspace_content", { workspace_id: otherWorkspaceId })
          .subscribe({ ttl: 60 });
        if (cancelled) {
          subscription.unsubscribe();
          return;
        }
        subscriptions.push(subscription);
        await subscription.waitForFirstSync(abortController.signal);
      })
    ).then((outcomes) => {
      if (cancelled) {
        return;
      }
      const failure = outcomes.find(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected"
      );
      if (failure) {
        log.warn({
          tag: "Search",
          msg: "some workspace content streams failed to sync for search",
          error: parseError(failure.reason),
        });
      }
    });

    return () => {
      cancelled = true;
      abortController.abort();
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    };
  }, [db, otherWorkspaceIds, shouldHydrateContent, syncAccess]);

  const workspaceIds = useMemo(
    () =>
      getSearchTerms(parsedQuery, "workspace").length > 0
        ? [
            ...new Set(
              filteredResources.map((resource) => resource.workspaceId)
            ),
          ]
        : undefined,
    [filteredResources, parsedQuery]
  );
  const resourceTypeIds = useMemo(
    () =>
      getSearchTerms(parsedQuery, "extension").length > 0 ||
      getSearchTerms(parsedQuery, "resource-type").length > 0
        ? [...new Set(filteredResources.map((resource) => resource.pluginId))]
        : undefined,
    [filteredResources, parsedQuery]
  );
  const resourceIds = useMemo(
    () =>
      getSearchTerms(parsedQuery, "title").length > 0
        ? filteredResources.map((resource) => resource.resourceId)
        : undefined,
    [filteredResources, parsedQuery]
  );
  const search = isSearchActive
    ? buildSearchIndexQuery({
        workspaceIds,
        resourceIds,
        resourceTypeIds,
        terms: unscopedTerms.map(({ exact, value }) => ({ exact, value })),
        organizationId,
      })
    : null;
  const results = useQuery<SearchIndexResultRow>(
    search?.sql ?? EMPTY_SEARCH_QUERY,
    search?.params ?? []
  );
  const stableResultRowsRef = useRef<{
    rows: SearchIndexResultRow[];
    organizationId: string;
  }>({ rows: [], organizationId });

  if (
    !isSearchActive ||
    stableResultRowsRef.current.organizationId !== organizationId
  ) {
    stableResultRowsRef.current = { rows: [], organizationId };
  } else if (!results.isFetching) {
    stableResultRowsRef.current.rows = results.data ?? [];
  }

  if (!isSearchActive) {
    return [];
  }
  return stableResultRowsRef.current.rows.map((row) => {
    const preview = parseSearchSnippet(row.preview);
    return {
      id: `content-${row.resource_id}`,
      resourceId: row.resource_id,
      label: row.resource_name || "Untitled",
      pluginId: row.resource_type_id,
      preview: preview.text,
      previewHighlights: preview.highlights,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name || t("common.untitled"),
      workspaceSlug: row.workspace_slug ?? "",
      type: "resource" as const,
    };
  });
}
