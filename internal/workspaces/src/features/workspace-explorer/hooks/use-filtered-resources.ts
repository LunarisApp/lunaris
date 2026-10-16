"use client";

import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { useEffect, useMemo, useState } from "react";
import { SEARCH_DEBOUNCE_MS } from "../constants";
import { useWorkspaceResources } from "../store";
import { isFolder } from "../types";

const nameCollator = new Intl.Collator(undefined, { sensitivity: "base" });

/**
 * Debounced case-insensitive filter over workspace resources (folders excluded).
 * Returns a flat, alphabetically sorted list of resources whose name matches the query.
 *
 * @param query - Raw search query (not yet debounced)
 * @param debounceMs - Debounce delay in ms (default SEARCH_DEBOUNCE_MS)
 */
export function useFilteredResources(
  query: string,
  debounceMs: number = SEARCH_DEBOUNCE_MS
): WorkspaceResourceEntity[] {
  const resources = useWorkspaceResources();
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return useMemo(() => {
    const trimmed = debouncedQuery.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }

    const matches: WorkspaceResourceEntity[] = [];
    for (const resource of resources) {
      if (isFolder(resource)) {
        continue;
      }
      if (!resource.resource_type_id) {
        continue;
      }
      const name = (resource.name || "").toLowerCase();
      if (name.includes(trimmed)) {
        matches.push(resource);
      }
    }

    matches.sort((a, b) => nameCollator.compare(a.name || "", b.name || ""));
    return matches;
  }, [resources, debouncedQuery]);
}
