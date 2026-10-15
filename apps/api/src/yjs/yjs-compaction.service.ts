import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { createLogger } from "evlog";
import { applyUpdateV2, Doc, encodeStateAsUpdateV2 } from "yjs";
import { yjsDocumentUpdatesDb } from "./yjs.entity";

const ADVISORY_LOCK_KEY = 4_271_001;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_YJS_RETENTION_DAYS = 7;
const MIN_YJS_RETENTION_DAYS = 1;

/** Context compaction constants. */
const CONTEXT_COMPACTION_WINDOW_MINUTES = 5;
const CONTEXT_MAX_GAP_SECONDS = 3;
const CONTEXT_MIN_CLUSTER_SIZE = 3;
const CONTEXT_COOLDOWN_SECONDS = 5;

type YjsUpdateRow = {
  id: string;
  workspaceId: string;
  documentId: string;
  userId: string | null;
  updateData: Buffer;
  createdAt: Date;
  updatedAt: Date;
};

type CompactableCluster = {
  documentId: string;
  ids: string[];
};

type CompactableDayBucket = {
  documentId: string;
  bucketStart: Date;
};

@Injectable()
export class YjsCompactionService {
  private contextCompactionRunning = false;

  constructor(private readonly databaseService: DatabaseService) {}

  @Cron("0 3 * * *", {
    name: "yjs-daily-retention-compaction",
    timeZone: "Europe/Oslo",
  })
  async compactExpiredUpdatesDaily() {
    await this.compactEligibleBuckets();
  }

  async compactEligibleBuckets() {
    const log = createLogger({ task: "yjs-retention-compaction" });
    const db = this.databaseService.db;
    let acquired = false;

    try {
      const lock = await db.execute(
        sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS acquired`
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) {
        log.set({ compaction: { status: "lock-skipped" } });
        return;
      }

      const eligibleBuckets = await this.findEligibleBuckets();
      log.set({
        compaction: { eligibleBuckets: eligibleBuckets.length },
      });

      if (eligibleBuckets.length === 0) {
        log.set({ compaction: { status: "no-op" } });
        return;
      }

      let compactedBuckets = 0;
      let skippedBuckets = 0;

      for (const bucket of eligibleBuckets) {
        try {
          const compacted = await this.compactBucket(
            bucket.documentId,
            bucket.bucketStart
          );
          if (compacted) {
            compactedBuckets += 1;
          }
        } catch (error) {
          skippedBuckets += 1;
          log.error(asError(error), {
            compaction: {
              failedBuckets: [
                {
                  bucketStart: bucket.bucketStart.toISOString(),
                  documentId: bucket.documentId,
                },
              ],
            },
          });
        }
      }

      log.set({
        compaction: {
          compactedBuckets,
          skippedBuckets,
          status: skippedBuckets > 0 ? "partial" : "complete",
        },
      });
    } catch (error) {
      log.set({ compaction: { status: "failed" } });
      log.error(asError(error));
      throw error;
    } finally {
      try {
        if (acquired) {
          await db.execute(
            sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`
          );
        }
      } catch (error) {
        log.error(asError(error), {
          compaction: { lockReleaseStatus: "failed" },
        });
        throw error;
      } finally {
        log.emit();
      }
    }
  }

  async compactBucket(documentId: string, bucketStart: Date) {
    const db = this.databaseService.db;
    const bucketEnd = new Date(bucketStart.getTime() + DAY_IN_MS);

    return db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: yjsDocumentUpdatesDb.id,
          workspaceId: yjsDocumentUpdatesDb.workspaceId,
          documentId: yjsDocumentUpdatesDb.documentId,
          userId: yjsDocumentUpdatesDb.userId,
          updateData: yjsDocumentUpdatesDb.updateData,
          createdAt: yjsDocumentUpdatesDb.createdAt,
          updatedAt: yjsDocumentUpdatesDb.updatedAt,
        })
        .from(yjsDocumentUpdatesDb)
        .where(
          and(
            eq(yjsDocumentUpdatesDb.documentId, documentId),
            gte(yjsDocumentUpdatesDb.createdAt, bucketStart),
            lt(yjsDocumentUpdatesDb.createdAt, bucketEnd)
          )
        )
        .orderBy(
          desc(yjsDocumentUpdatesDb.createdAt),
          desc(yjsDocumentUpdatesDb.id)
        )
        .for("update");

      if (rows.length <= 1) {
        return false;
      }

      return this.executeCompaction(tx, rows, documentId);
    });
  }

  /**
   * Shared compaction logic: group rows by userId, merge each group separately,
   * delete originals, and insert one merged row per user. Rows with no other
   * row sharing their userId pass through untouched to avoid pointless churn.
   *
   * Yjs property: merging updates per-user then applying the resulting N updates
   * to a fresh Doc yields the same state as merging all updates together.
   */
  async executeCompaction(
    tx: DatabaseOrTx,
    rowsToCompact: YjsUpdateRow[],
    documentId: string
  ) {
    if (rowsToCompact.length === 0) {
      return false;
    }

    const groups = new Map<string, YjsUpdateRow[]>();
    for (const row of rowsToCompact) {
      const key = row.userId ?? "\u0000null";
      const existing = groups.get(key);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    const mergeableGroups = Array.from(groups.values()).filter(
      (group) => group.length >= 2
    );

    if (mergeableGroups.length === 0) {
      return false;
    }

    const compactedIds = mergeableGroups.flatMap((group) =>
      group.map((row) => row.id)
    );

    const insertRows = mergeableGroups.map((group) => {
      const mergedUpdate = this.mergeUpdates(group);
      const newestRow = group.reduce((a, b) =>
        a.createdAt > b.createdAt ? a : b
      );
      return {
        workspaceId: newestRow.workspaceId,
        documentId,
        userId: newestRow.userId,
        updateData: mergedUpdate,
        createdAt: newestRow.createdAt,
        updatedAt: newestRow.updatedAt,
        syncedCreatedAt: newestRow.createdAt,
        syncedUpdatedAt: newestRow.updatedAt,
      };
    });

    await tx
      .delete(yjsDocumentUpdatesDb)
      .where(
        and(
          eq(yjsDocumentUpdatesDb.documentId, documentId),
          inArray(yjsDocumentUpdatesDb.id, compactedIds)
        )
      );

    await tx.insert(yjsDocumentUpdatesDb).values(insertRows);

    return true;
  }

  async findEligibleBuckets(): Promise<CompactableDayBucket[]> {
    const result = await this.databaseService.db.execute<{
      document_id: string;
      bucket_start: Date | string;
    }>(sql`
      SELECT
        updates.document_id,
        updates.bucket_start
      FROM (
        SELECT
          per_user.document_id,
          per_user.bucket_start
        FROM (
          SELECT
            u.document_id,
            date_trunc('day', u.created_at) AS bucket_start,
            u.user_id,
            count(*) AS user_row_count,
            max(u.created_at) AS user_max_created,
            max(COALESCE(o.yjs_retention_days, ${DEFAULT_YJS_RETENTION_DAYS})) AS retention_days
          FROM yjs_document_updates u
          INNER JOIN workspaces p ON p.id = u.workspace_id
          INNER JOIN organization o ON o.id = p.organization_id
          GROUP BY u.document_id, date_trunc('day', u.created_at), u.user_id
        ) per_user
        GROUP BY per_user.document_id, per_user.bucket_start
        HAVING
          bool_or(per_user.user_row_count >= 2)
          AND max(per_user.user_max_created) < NOW() - make_interval(
            days => GREATEST(
              max(per_user.retention_days),
              ${MIN_YJS_RETENTION_DAYS}
            )
          )
      ) updates
      ORDER BY updates.bucket_start ASC, updates.document_id ASC
    `);

    return result.rows.map((row) => ({
      documentId: row.document_id,
      bucketStart: new Date(row.bucket_start),
    }));
  }

  private mergeUpdates(rows: YjsUpdateRow[]) {
    const doc = new Doc();

    try {
      for (const row of [...rows].reverse()) {
        applyUpdateV2(doc, new Uint8Array(row.updateData));
      }

      return Buffer.from(encodeStateAsUpdateV2(doc));
    } finally {
      doc.destroy();
    }
  }

  // ---------------------------------------------------------------------------
  // Context-based compaction: merge editing bursts (consecutive updates < 3s apart)
  // ---------------------------------------------------------------------------

  @Cron("*/30 * * * * *", {
    name: "yjs-context-compaction",
  })
  async compactRecentClusters() {
    if (this.contextCompactionRunning) {
      return;
    }
    this.contextCompactionRunning = true;

    try {
      return await this.runContextCompaction();
    } finally {
      this.contextCompactionRunning = false;
    }
  }

  private async runContextCompaction() {
    const log = createLogger({ task: "yjs-context-compaction" });

    try {
      const clusters = await this.findCompactableClusters();
      log.set({ compaction: { eligibleClusters: clusters.length } });

      if (clusters.length === 0) {
        log.setLevel("debug");
        log.set({ compaction: { status: "no-op" } });
        return;
      }

      let compactedClusters = 0;
      let skippedClusters = 0;
      for (const cluster of clusters) {
        try {
          const compacted = await this.compactCluster(
            cluster.documentId,
            cluster.ids
          );
          if (compacted) {
            compactedClusters += 1;
          } else {
            skippedClusters += 1;
          }
        } catch (error) {
          skippedClusters += 1;
          log.error(asError(error), {
            compaction: {
              failedClusters: [{ documentId: cluster.documentId }],
            },
          });
        }
      }

      log.set({
        compaction: {
          compactedClusters,
          skippedClusters,
          status: skippedClusters > 0 ? "partial" : "complete",
        },
      });
    } catch (error) {
      log.set({ compaction: { status: "failed" } });
      log.error(asError(error));
      throw error;
    } finally {
      log.emit();
    }
  }

  /**
   * Find clusters of consecutive updates (gap <= 3s) that are eligible for
   * compaction: at least 3 updates, and the newest update is > 5s old.
   */
  async findCompactableClusters(): Promise<CompactableCluster[]> {
    const result = await this.databaseService.db.execute<{
      document_id: string;
      ids: string[];
    }>(sql`
      WITH updates AS (
        SELECT id, document_id, created_at,
          LAG(created_at) OVER (PARTITION BY document_id ORDER BY created_at) AS prev_at
        FROM yjs_document_updates
        WHERE created_at > NOW() - INTERVAL '1 minute' * ${CONTEXT_COMPACTION_WINDOW_MINUTES}
      ),
      gaps AS (
        SELECT *,
          CASE WHEN prev_at IS NULL
               OR EXTRACT(EPOCH FROM (created_at - prev_at)) > ${CONTEXT_MAX_GAP_SECONDS}
          THEN 1 ELSE 0 END AS new_cluster
        FROM updates
      ),
      clustered AS (
        SELECT *, SUM(new_cluster) OVER (PARTITION BY document_id ORDER BY created_at) AS cluster_id
        FROM gaps
      )
      SELECT document_id, array_agg(id ORDER BY created_at) AS ids
      FROM clustered
      GROUP BY document_id, cluster_id
      HAVING COUNT(*) >= ${CONTEXT_MIN_CLUSTER_SIZE}
         AND MAX(created_at) < NOW() - INTERVAL '1 second' * ${CONTEXT_COOLDOWN_SECONDS}
    `);

    return result.rows.map((row) => ({
      documentId: row.document_id,
      ids: row.ids,
    }));
  }

  /**
   * Compact a specific cluster of update IDs for a document.
   * Uses per-document advisory lock to prevent concurrent compaction.
   */
  async compactCluster(documentId: string, ids: string[]) {
    const db = this.databaseService.db;
    const lockKey = this.documentLockKey(documentId);

    return db.transaction(async (tx) => {
      const lock = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired`
      );

      if (lock.rows[0]?.acquired !== true) {
        return false;
      }

      const rows = await tx
        .select({
          id: yjsDocumentUpdatesDb.id,
          workspaceId: yjsDocumentUpdatesDb.workspaceId,
          documentId: yjsDocumentUpdatesDb.documentId,
          userId: yjsDocumentUpdatesDb.userId,
          updateData: yjsDocumentUpdatesDb.updateData,
          createdAt: yjsDocumentUpdatesDb.createdAt,
          updatedAt: yjsDocumentUpdatesDb.updatedAt,
        })
        .from(yjsDocumentUpdatesDb)
        .where(
          and(
            eq(yjsDocumentUpdatesDb.documentId, documentId),
            inArray(yjsDocumentUpdatesDb.id, ids)
          )
        )
        .orderBy(yjsDocumentUpdatesDb.createdAt)
        .for("update");

      if (rows.length < CONTEXT_MIN_CLUSTER_SIZE) {
        return false;
      }

      return this.executeCompaction(tx, rows, documentId);
    });
  }

  /** Stable per-document advisory lock key in a separate namespace from the weekly lock. */
  private documentLockKey(documentId: string): number {
    let hash = 0;
    for (let i = 0; i < documentId.length; i++) {
      hash = (hash * 31 + documentId.charCodeAt(i)) | 0;
    }
    return (hash ^ 0x59_4a_53) | 0;
  }
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
