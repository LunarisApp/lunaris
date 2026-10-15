"use client";

import {
  useResourceTypes,
  useSearchIndexers,
} from "@lunarisapp/plugin-sdk";
import { usePowerSync, useQuery } from "@repo/data/core";
import {
  deleteStaleSearchIndexEntries,
  getSearchIndexRevisions,
} from "@repo/data/features/search-index";
import { log, parseError } from "evlog";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchScope } from "./scope";
import {
  type IndexableResourceRow,
  INDEXABLE_RESOURCES_QUERY,
  planSearchIndexUpdates,
  runSearchIndexJob,
} from "./search-index-runtime";

const INDEX_DEBOUNCE_MS = 400;
const INDEX_CONCURRENCY = 4;
const reconciliationQueues = new WeakMap<object, Promise<void>>();

export function enqueueSearchIndexReconciliation(
  database: object,
  task: () => Promise<void>,
): Promise<void> {
  const previous = reconciliationQueues.get(database) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const queued = next.finally(() => {
    if (reconciliationQueues.get(database) === queued) {
      reconciliationQueues.delete(database);
    }
  });
  reconciliationQueues.set(database, queued);
  return queued;
}

class IndexTaskPool {
  private active = 0;
  private readonly queue: Array<() => Promise<void>> = [];

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    this.drain();
  }

  private drain(): void {
    while (this.active < INDEX_CONCURRENCY) {
      const task = this.queue.shift();
      if (!task) return;
      this.active += 1;
      void task().finally(() => {
        this.active -= 1;
        this.drain();
      });
    }
  }
}

interface IndexWork {
  epoch: number;
  revision: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export function SearchIndexCoordinator({ enabled = true }: { enabled?: boolean }) {
  const db = usePowerSync();
  const { organizationId } = useSearchScope();
  const resourceTypes = useResourceTypes();
  const indexers = useSearchIndexers();
  const activeOrganization = useRef(organizationId);
  const epochs = useRef(new Map<string, number>());
  const work = useRef(new Map<string, IndexWork>());
  const pool = useRef(new IndexTaskPool());
  const query = useQuery<IndexableResourceRow>(INDEXABLE_RESOURCES_QUERY, [organizationId]);
  const definitions = useMemo(
    () => new Map(resourceTypes.map((definition) => [definition.resourceTypeId, definition])),
    [resourceTypes],
  );

  const invalidateAll = useCallback((): void => {
    for (const job of work.current.values()) {
      if (job.timer !== null) clearTimeout(job.timer);
    }
    work.current.clear();
    for (const [entryKey, epoch] of epochs.current) {
      epochs.current.set(entryKey, epoch + 1);
    }
  }, []);

  useEffect(() => {
    if (activeOrganization.current === organizationId) return;
    invalidateAll();
    activeOrganization.current = organizationId;
  }, [invalidateAll, organizationId]);

  useEffect(() => {
    if (!enabled) invalidateAll();
  }, [enabled, invalidateAll]);

  useEffect(
    () => () => {
      invalidateAll();
    },
    [invalidateAll],
  );

  useEffect(() => {
    if (!enabled || !organizationId || query.isLoading) return;
    let cancelled = false;
    const rows = query.data ?? [];
    void enqueueSearchIndexReconciliation(db, async () => {
      if (cancelled) return;
      const revisions = await getSearchIndexRevisions(db, organizationId);
      const { activeEntryKeys, entryStates, jobs } = planSearchIndexUpdates(
        rows,
        definitions,
        indexers,
        revisions,
      );

      if (cancelled) return;
      for (const [entryKey, scheduled] of work.current) {
        const state = entryStates.get(entryKey);
        if (state?.available && state.revision === scheduled.revision) continue;
        if (scheduled.timer !== null) clearTimeout(scheduled.timer);
        work.current.delete(entryKey);
        epochs.current.set(entryKey, scheduled.epoch + 1);
      }
      await deleteStaleSearchIndexEntries(
        db,
        organizationId,
        activeEntryKeys,
        revisions.keys(),
      );
      if (cancelled) return;

      for (const job of jobs) {
        const scheduled = work.current.get(job.entryKey);
        if (scheduled?.revision === job.revision) continue;
        if (scheduled && scheduled.timer !== null) {
          clearTimeout(scheduled.timer);
        }
        const epoch = (epochs.current.get(job.entryKey) ?? 0) + 1;
        epochs.current.set(job.entryKey, epoch);
        const timer = setTimeout(() => {
          const currentWork = work.current.get(job.entryKey);
          if (currentWork?.epoch !== epoch) return;
          currentWork.timer = null;
          pool.current.enqueue(async () => {
            try {
              await runSearchIndexJob({
                db,
                isCurrent: () => epochs.current.get(job.entryKey) === epoch,
                job,
                organizationId,
              });
            } catch (error) {
              log.warn({
                tag: "Search",
                msg: "resource indexing failed",
                error: parseError(error),
                indexerId: job.indexer.definition.id,
                resourceId: job.row.id,
              });
            } finally {
              if (work.current.get(job.entryKey)?.epoch === epoch) {
                work.current.delete(job.entryKey);
              }
            }
          });
        }, INDEX_DEBOUNCE_MS);
        work.current.set(job.entryKey, { epoch, revision: job.revision, timer });
      }
    }).catch((error) => {
      if (cancelled) return;
      log.error({
        tag: "Search",
        msg: "search index reconciliation failed",
        error: parseError(error),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [db, definitions, enabled, indexers, query.data, query.isLoading, organizationId]);

  return null;
}
