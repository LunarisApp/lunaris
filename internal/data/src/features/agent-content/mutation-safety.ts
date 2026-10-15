import type { AbstractPowerSyncDatabase } from "@powersync/common";
import type { ActionPreview } from "@repo/agent-contracts";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import { canonicalJson, hashString, randomToken } from "./fingerprint";
import {
  AGENT_ACTION_PREVIEWS_TABLE,
  AGENT_IDEMPOTENCY_TABLE,
} from "./table";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 5 * 60 * 1000;

interface IdempotencyRow {
  operation: string;
  request_hash: string;
  response: string | null;
  status: string;
}

interface PreviewRow {
  action: ActionPreview["action"];
  actor_id: string;
  expires_at: string;
  fingerprint: string;
  id: string;
  organization_id: string;
  target_id: string;
  used_at: string | null;
}

export function createMutationSafety(
  db: AbstractPowerSyncDatabase,
  getActorId: () => string,
) {
  const inflight = new Map<
    string,
    { fingerprint: string; result: Promise<unknown> }
  >();

  const idempotent = async <T>(
    operation: string,
    key: string | undefined,
    input: unknown,
    run: (database: DatabaseOrTx) => Promise<T>,
  ) => {
    if (!key) {
      throw safetyError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required",
        400,
      );
    }
    const actorId = getActorId();
    const cacheKey = `${actorId}:${key}`;
    const inflightFingerprint = canonicalJson({ input, operation });
    const cached = inflight.get(cacheKey);
    if (cached) {
      if (cached.fingerprint !== inflightFingerprint) {
        throw idempotencyConflict();
      }
      return cached.result as Promise<T>;
    }

    const execute = async () => {
      const requestFingerprint = await hashString(canonicalJson(input));
      const now = new Date();
      await cleanupSafetyRecords(db, now);
      const existing = await findIdempotencyRecord(db, actorId, key);
      if (existing) {
        return replayIdempotency<T>(
          existing,
          operation,
          requestFingerprint,
        );
      }

      const id = `idem_${await hashString(`${actorId}\0${key}`)}`;
      return ensureTx(db, async (tx) => {
        const claimed = await findIdempotencyRecord(tx, actorId, key);
        if (claimed) {
          return replayIdempotency<T>(
            claimed,
            operation,
            requestFingerprint,
          );
        }
        await tx.execute(
          `INSERT INTO ${AGENT_IDEMPOTENCY_TABLE}
           (id, actor_id, created_at, expires_at, key, operation, request_hash, response, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            actorId,
            now.toISOString(),
            new Date(now.getTime() + IDEMPOTENCY_TTL_MS).toISOString(),
            key,
            operation,
            requestFingerprint,
            null,
            "processing",
          ],
        );
        const value = await run(tx);
        await tx.execute(
          `UPDATE ${AGENT_IDEMPOTENCY_TABLE} SET response = ?, status = ? WHERE id = ?`,
          [JSON.stringify(value), "complete", id],
        );
        return value;
      });
    };

    let result: Promise<T>;
    result = execute().finally(() => {
      if (inflight.get(cacheKey)?.result === result) {
        inflight.delete(cacheKey);
      }
    });
    inflight.set(cacheKey, {
      fingerprint: inflightFingerprint,
      result,
    });
    return result;
  };

  const preview = async (
    action: ActionPreview["action"],
    organizationId: string,
    targetId: string,
    impact: ActionPreview["impact"],
    fingerprint: string,
  ): Promise<ActionPreview> => {
    const actorId = getActorId();
    const previewToken = randomToken();
    const tokenHash = await hashString(previewToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PREVIEW_TTL_MS).toISOString();
    await cleanupSafetyRecords(db, now);
    await db.execute(
      `INSERT INTO ${AGENT_ACTION_PREVIEWS_TABLE}
       (id, action, actor_id, created_at, expires_at, fingerprint, impact, target_id, token_hash, used_at, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `preview_${tokenHash}`,
        action,
        actorId,
        now.toISOString(),
        expiresAt,
        fingerprint,
        JSON.stringify(impact),
        targetId,
        tokenHash,
        null,
        organizationId,
      ],
    );
    return {
      action,
      expiresAt,
      impact,
      previewToken,
      targetId,
    };
  };

  const consumePreview = async (
    database: DatabaseOrTx,
    token: string,
    action: ActionPreview["action"],
    organizationId: string,
    targetId: string,
    fingerprint: string,
  ) => {
    const actorId = getActorId();
    const tokenHash = await hashString(token);
    const value = await database.getOptional<PreviewRow>(
      `SELECT * FROM ${AGENT_ACTION_PREVIEWS_TABLE} WHERE token_hash = ? LIMIT 1`,
      [tokenHash],
    );
    const usedAt = new Date().toISOString();
    if (
      !value ||
      value.action !== action ||
      value.actor_id !== actorId ||
      value.organization_id !== organizationId ||
      value.target_id !== targetId ||
      value.used_at !== null ||
      value.expires_at <= usedAt
    ) {
      throw safetyError(
        "INVALID_PREVIEW",
        "Deletion preview is invalid or expired",
        409,
      );
    }
    if (value.fingerprint !== fingerprint) {
      throw safetyError(
        "PREVIEW_CHANGED",
        "Resource changed after preview; request a new preview",
        409,
      );
    }
    await database.execute(
      `UPDATE ${AGENT_ACTION_PREVIEWS_TABLE} SET used_at = ? WHERE id = ?`,
      [usedAt, value.id],
    );
  };

  return { consumePreview, idempotent, preview };
}

function findIdempotencyRecord(
  database: DatabaseOrTx,
  actorId: string,
  key: string,
) {
  return database.getOptional<IdempotencyRow>(
    `SELECT operation, request_hash, response, status
     FROM ${AGENT_IDEMPOTENCY_TABLE}
     WHERE actor_id = ? AND key = ?
     LIMIT 1`,
    [actorId, key],
  );
}

function replayIdempotency<T>(
  record: IdempotencyRow,
  operation: string,
  requestFingerprint: string,
) {
  if (
    record.operation !== operation ||
    record.request_hash !== requestFingerprint
  ) {
    throw idempotencyConflict();
  }
  if (record.status === "complete" && record.response) {
    return JSON.parse(record.response) as T;
  }
  throw safetyError(
    "IDEMPOTENCY_IN_PROGRESS",
    "Matching operation is still processing",
    409,
  );
}

function idempotencyConflict() {
  return safetyError(
    "IDEMPOTENCY_CONFLICT",
    "Idempotency key was already used for another request",
    409,
  );
}

async function cleanupSafetyRecords(
  database: DatabaseOrTx,
  now: Date,
) {
  const timestamp = now.toISOString();
  await database.execute(
    `DELETE FROM ${AGENT_IDEMPOTENCY_TABLE} WHERE expires_at <= ?`,
    [timestamp],
  );
  await database.execute(
    `DELETE FROM ${AGENT_ACTION_PREVIEWS_TABLE} WHERE expires_at <= ?`,
    [timestamp],
  );
}

function safetyError(code: string, message: string, status: number) {
  return Object.assign(new Error(message), {
    code,
    exposeToAgent: true,
    status,
  });
}
