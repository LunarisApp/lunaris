import { type AdditionalOptions, useQuery } from "@powersync/react";
import { usePowerSync } from "@repo/data/core";
import { parseUTCTimestamp } from "@repo/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Doc } from "yjs";
import { buildUnionAllQuery } from "../workspace-storage";
import {
  type YjsCacheOutcome,
  yjsDocumentResourceStore,
} from "./document-resource-store";
import type { YjsPowersyncProvider } from "./provider";
import type { YjsDocumentUpdateRow } from "./services";
import {
  LOCAL_YJS_DOCUMENT_UPDATES_TABLE,
  LOCAL_YJS_DOCUMENTS_TABLE,
  YJS_DOCUMENT_UPDATES_TABLE,
  YJS_DOCUMENTS_TABLE,
} from "./table";

export type {
  PreloadYjsDocumentArgs,
  PreloadYjsDocumentHandle,
  WaitForYjsDocumentPersistenceInput,
  YjsPreloadPriority,
} from "./document-resource-store";
export {
  _getPreloadStateForTests,
  _resetYDocCacheForTests,
  _setPreloadLimitsForTests,
  preloadYjsDocument,
  waitForYjsDocumentPersistence,
} from "./document-resource-store";

/** Default debounce delay for timestamp updates (ms) */
const TIMESTAMP_DEBOUNCE_MS = 500;
const YJS_DOCUMENTS_ORDER_BY = "created_at ASC, id ASC";
const YJS_DOCUMENTS_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${YJS_DOCUMENTS_TABLE}`,
  `SELECT * FROM ${LOCAL_YJS_DOCUMENTS_TABLE}`
);
const YJS_DOCUMENT_UPDATES_UNION_QUERY = buildUnionAllQuery(
  `SELECT * FROM ${YJS_DOCUMENT_UPDATES_TABLE}`,
  `SELECT * FROM ${LOCAL_YJS_DOCUMENT_UPDATES_TABLE}`
);

export interface UseReadyYjsDocumentResult {
  cacheOutcome?: YjsCacheOutcome;
  error: Error | null;
  isLoading: boolean;
  queueTiming?: { queuedAt: number; loadStartedAt: number };
  yDoc: Doc | null;
  yProvider: YjsPowersyncProvider | null;
}

function emptyReadyYjsDocumentState(
  isLoading: boolean
): UseReadyYjsDocumentResult {
  return { error: null, isLoading, yDoc: null, yProvider: null };
}

function loadedReadyYjsDocumentState(
  resource: Parameters<typeof yjsDocumentResourceStore.acquireMount>[0],
  cacheOutcome: YjsCacheOutcome
): UseReadyYjsDocumentResult {
  return {
    cacheOutcome,
    queueTiming:
      resource.loadStartedAt === undefined
        ? undefined
        : {
            queuedAt: resource.queuedAt,
            loadStartedAt: resource.loadStartedAt,
          },
    error: null,
    isLoading: false,
    yDoc: resource.doc,
    yProvider: resource.provider,
  };
}

function failedReadyYjsDocumentState(
  error: unknown
): UseReadyYjsDocumentResult {
  return {
    error: error instanceof Error ? error : new Error(String(error)),
    isLoading: false,
    yDoc: null,
    yProvider: null,
  };
}

/**
 * Single-step Yjs document hook: ensures the document exists, loads it,
 * and caches the Y.Doc + provider across mount/unmount cycles.
 *
 * Cache hits for recently released documents skip rehydration entirely.
 */
export function useReadyYjsDocument(
  documentId: string | undefined,
  workspaceId: string,
  options?: {
    enabled?: boolean;
    userId?: string | null;
  }
): UseReadyYjsDocumentResult {
  const db = usePowerSync();
  const enabled = options?.enabled ?? true;
  const userId = options?.userId;
  const identity = useMemo(
    () => ({ db, documentId, workspaceId, enabled }),
    [db, documentId, workspaceId, enabled]
  );
  const readInitialState = (): UseReadyYjsDocumentResult => {
    if (!(documentId && enabled)) {
      return emptyReadyYjsDocumentState(false);
    }
    const cached = yjsDocumentResourceStore.get(db, documentId, workspaceId);
    if (cached?.status === "ready" && cached.provider) {
      return loadedReadyYjsDocumentState(cached, "memory");
    }
    return emptyReadyYjsDocumentState(true);
  };
  const [snapshot, setSnapshot] = useState(() => ({
    identity,
    value: readInitialState(),
  }));

  useEffect(() => {
    const setState = (value: UseReadyYjsDocumentResult) =>
      setSnapshot({ identity, value });
    if (!(documentId && enabled)) {
      setState(emptyReadyYjsDocumentState(false));
      return;
    }

    let mounted = true;
    const { cacheOutcome, resource } = yjsDocumentResourceStore.getOrCreate(
      db,
      documentId,
      workspaceId,
      "intent"
    );
    yjsDocumentResourceStore.acquireMount(resource, userId);

    if (resource.status === "ready" && resource.provider) {
      resource.provider.setUserId(userId);
      setState(loadedReadyYjsDocumentState(resource, cacheOutcome));
      return () => {
        yjsDocumentResourceStore.releaseMount(resource);
      };
    }

    setState(emptyReadyYjsDocumentState(true));

    const start = async () => {
      try {
        await resource.ready;
        if (!(mounted && resource.provider)) {
          return;
        }
        resource.provider.setUserId(userId);
        setState(loadedReadyYjsDocumentState(resource, cacheOutcome));
      } catch (e) {
        if (mounted) {
          setState(failedReadyYjsDocumentState(e));
        }
      }
    };

    start();

    return () => {
      mounted = false;
      yjsDocumentResourceStore.releaseMount(resource);
    };
  }, [db, documentId, workspaceId, enabled, userId, identity]);

  // A slot lookup can enable/change the document after this hook first mounted.
  // Never expose the previous document (or its empty/error state) for that new identity.
  return snapshot.identity === identity ? snapshot.value : readInitialState();
}

export function useYjsDocumentsQuery(
  workspaceId: string,
  options?: AdditionalOptions
) {
  const { query, params } = getYjsDocumentsQuery(workspaceId);
  return useQuery(query, params, options);
}

export type { YjsDocumentUpdateRow } from "./services";

export function useYjsDocumentUpdatesQuery(
  documentId: string,
  options?: AdditionalOptions
) {
  return useQuery<YjsDocumentUpdateRow>(
    `SELECT id, user_id, update_b64, created_at FROM (${YJS_DOCUMENT_UPDATES_UNION_QUERY}) yjs_document_updates WHERE document_id = ? ORDER BY created_at ASC, id ASC`,
    [documentId],
    options
  );
}

export function getYjsDocumentsQuery(workspaceId: string) {
  return {
    query: `
      SELECT
        documents.*,
        COUNT(updates.id) as update_count
      FROM (${YJS_DOCUMENTS_UNION_QUERY}) documents
      LEFT JOIN (${YJS_DOCUMENT_UPDATES_UNION_QUERY}) updates ON updates.document_id = documents.id
      WHERE documents.workspace_id = ?
      GROUP BY documents.id, documents.workspace_id, documents.created_at, documents.updated_at
      ORDER BY documents.${YJS_DOCUMENTS_ORDER_BY}
    `,
    params: [workspaceId],
  };
}

// Types for document last edited hook
interface MaxCreatedAtResult {
  max_created_at: string | null;
}

export interface UseDocumentLastEditedResult {
  isLoading: boolean;
  lastEditedAt: Date | null;
}

/**
 * Hook to get the last edited timestamp for a document.
 * Queries MAX(created_at) from yjs_document_updates table.
 * Reactive to PowerSync - updates when document updates change.
 * Debounced to prevent excessive re-renders during rapid edits.
 */
export function useDocumentLastEdited(
  documentId: string,
  options?: AdditionalOptions & { debounceMs?: number }
): UseDocumentLastEditedResult {
  const { debounceMs = TIMESTAMP_DEBOUNCE_MS, ...queryOptions } = options ?? {};

  const { data, isLoading } = useQuery<MaxCreatedAtResult>(
    `SELECT strftime('%Y-%m-%dT%H:%M:%fZ', MAX(julianday(at))) AS max_created_at FROM (
       SELECT updated_at AS at FROM (${YJS_DOCUMENTS_UNION_QUERY}) documents WHERE id = ?
       UNION ALL
       SELECT created_at AS at FROM (${YJS_DOCUMENT_UPDATES_UNION_QUERY}) updates WHERE document_id = ?
     ) activity`,
    [documentId, documentId],
    queryOptions
  );

  // Raw timestamp from query
  const rawLastEditedAt = useMemo(() => {
    const maxCreatedAt = data?.[0]?.max_created_at;
    return maxCreatedAt ? parseUTCTimestamp(maxCreatedAt) : null;
  }, [data]);

  // Debounced timestamp to prevent excessive re-renders during typing
  const [debouncedLastEditedAt, setDebouncedLastEditedAt] =
    useState<Date | null>(rawLastEditedAt);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // If no debounce needed (first load or immediate update desired)
    if (debouncedLastEditedAt === null && rawLastEditedAt !== null) {
      // First value - update immediately
      setDebouncedLastEditedAt(rawLastEditedAt);
      return;
    }

    // Debounce subsequent updates
    timeoutRef.current = setTimeout(() => {
      setDebouncedLastEditedAt(rawLastEditedAt);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [rawLastEditedAt, debounceMs, debouncedLastEditedAt]);

  return { lastEditedAt: debouncedLastEditedAt, isLoading };
}

// Types for document created at hook
interface CreatedAtResult {
  created_at: string | null;
}

export interface UseDocumentCreatedAtResult {
  createdAt: Date | null;
  isLoading: boolean;
}

/**
 * Hook to get the creation timestamp for a document.
 * Queries created_at from yjs_documents table.
 * Reactive to PowerSync - updates when document changes.
 */
export function useDocumentCreatedAt(
  documentId: string,
  options?: AdditionalOptions
): UseDocumentCreatedAtResult {
  const { data, isLoading } = useQuery<CreatedAtResult>(
    `SELECT created_at FROM (${YJS_DOCUMENTS_UNION_QUERY}) yjs_documents WHERE id = ?`,
    [documentId],
    options
  );

  const createdAt = useMemo(() => {
    const createdAtValue = data?.[0]?.created_at;
    return createdAtValue ? parseUTCTimestamp(createdAtValue) : null;
  }, [data]);

  return { createdAt, isLoading };
}
