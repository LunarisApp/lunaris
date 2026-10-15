"use client";

import { SYNC_ACCESS, useSyncAccess } from "@repo/data/core";
import {
  useWorkspacesQuery,
  WORKSPACE_INDEX_SYNC_STREAMS,
} from "@repo/data/features/workspaces";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchScope } from "../scope";
import { searchWorkspaces } from "../workspaces";
import type { WorkspaceSearchResult } from "../types";

export function useWorkspaceSearch(
  query: string,
  options: {
    excludeCurrentWorkspace?: boolean;
    includeAllWhenEmpty?: boolean;
    limit?: number;
  } = {},
): WorkspaceSearchResult[] {
  const excludeCurrentWorkspace = options.excludeCurrentWorkspace ?? false;
  const includeAllWhenEmpty = options.includeAllWhenEmpty ?? false;
  const limit = options.limit;
  const { t } = useTranslation();
  const syncAccess = useSyncAccess();
  const { organizationId, workspaceId } = useSearchScope();
  const workspacesQuery = useWorkspacesQuery({
    options:
      syncAccess === SYNC_ACCESS.cloud
        ? { streams: WORKSPACE_INDEX_SYNC_STREAMS }
        : undefined,
    organizationId,
  });

  return useMemo(
    () =>
      searchWorkspaces(
        workspacesQuery.data ?? [],
        query,
        workspaceId,
        t("common.untitled"),
        { excludeCurrentWorkspace, includeAllWhenEmpty, limit },
      ),
    [
      excludeCurrentWorkspace,
      includeAllWhenEmpty,
      limit,
      workspaceId,
      workspacesQuery.data,
      query,
      t,
    ],
  );
}
