import { createHash, randomBytes } from "node:crypto";
import { DatabaseService, isUniqueViolation } from "@app/db";
import type { DrizzleTransaction } from "@app/db/utils";
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { createId } from "@repo/utils";
import { and, eq, lte } from "drizzle-orm";
import { useLogger } from "evlog/nestjs";
import {
  agentActionPreviewsDb,
  agentAuditEventsDb,
  agentIdempotencyDb,
} from "../agent-control.entity";
import { asError } from "./agent-error.utils";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const RESULT_WRITE_ATTEMPTS = 5;

@Injectable()
export class AgentSafetyService {
  constructor(private readonly database: DatabaseService) {}

  async idempotent<T>(params: {
    actorId: string;
    key: string;
    operation: string;
    request: unknown;
    run: () => Promise<T>;
  }): Promise<T> {
    const now = new Date();
    const id = createId("idem");
    const requestHash = fingerprint(params.request);
    try {
      await this.database.db.insert(agentIdempotencyDb).values({
        actorId: params.actorId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        id,
        key: params.key,
        operation: params.operation,
        requestHash,
        status: "processing",
      });
    } catch (error) {
      if (!isUniqueViolation(error, "agent_idempotency_actor_key_unique")) {
        throw error;
      }
      const [existing] = await this.database.db
        .select()
        .from(agentIdempotencyDb)
        .where(
          and(
            eq(agentIdempotencyDb.actorId, params.actorId),
            eq(agentIdempotencyDb.key, params.key)
          )
        )
        .limit(1);
      if (!existing) {
        return this.idempotent(params);
      }
      if (
        existing.operation !== params.operation ||
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException(
          "Idempotency key was used for another request"
        );
      }
      if (existing.expiresAt <= now) {
        await this.database.db
          .delete(agentIdempotencyDb)
          .where(eq(agentIdempotencyDb.id, existing.id));
        return this.idempotent(params);
      }
      if (existing.status === "complete") {
        return existing.response as T;
      }
      throw new ConflictException("Matching operation is still processing");
    }

    let response: T;
    try {
      response = await params.run();
    } catch (error) {
      await this.database.db
        .delete(agentIdempotencyDb)
        .where(eq(agentIdempotencyDb.id, id));
      throw error;
    }

    await this.persistResult(id, params.operation, response);
    return response;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired() {
    const now = new Date();
    await Promise.all([
      this.database.db
        .delete(agentIdempotencyDb)
        .where(lte(agentIdempotencyDb.expiresAt, now)),
      this.database.db
        .delete(agentActionPreviewsDb)
        .where(lte(agentActionPreviewsDb.expiresAt, now)),
    ]);
  }

  async issuePreview(params: {
    action:
      | "delete_resource"
      | "delete_workspace"
      | "remove_organization_member";
    actorId: string;
    fingerprint: string;
    impact: {
      documents: number;
      resources: number;
      members: number;
      workspaces: number;
    };
    targetId: string;
    organizationId: string;
  }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PREVIEW_TTL_MS);
    const previewToken = randomBytes(32).toString("base64url");
    await this.database.db.insert(agentActionPreviewsDb).values({
      action: params.action,
      actorId: params.actorId,
      createdAt: now,
      expiresAt,
      fingerprint: params.fingerprint,
      id: createId("preview"),
      impact: params.impact,
      targetId: params.targetId,
      tokenHash: hash(previewToken),
      organizationId: params.organizationId,
    });
    return {
      action: params.action,
      expiresAt: expiresAt.toISOString(),
      impact: params.impact,
      previewToken,
      targetId: params.targetId,
    };
  }

  async executePreview<T>(params: {
    action: string;
    actorId: string;
    fingerprint: (tx: DrizzleTransaction) => Promise<string>;
    previewToken: string;
    run: (tx: DrizzleTransaction) => Promise<T>;
    targetId: string;
    organizationId: string;
  }): Promise<T> {
    const tokenHash = hash(params.previewToken);
    return this.database.db.transaction(
      async (tx) => {
        const now = new Date();
        const [preview] = await tx
          .select()
          .from(agentActionPreviewsDb)
          .where(eq(agentActionPreviewsDb.tokenHash, tokenHash))
          .for("update")
          .limit(1);
        if (
          !preview ||
          preview.usedAt ||
          preview.expiresAt <= now ||
          preview.action !== params.action ||
          preview.actorId !== params.actorId ||
          preview.targetId !== params.targetId ||
          preview.organizationId !== params.organizationId
        ) {
          throw new UnauthorizedException("Invalid or expired preview token");
        }
        if (preview.fingerprint !== (await params.fingerprint(tx))) {
          throw new ConflictException(
            "Resource changed after preview; request a new preview"
          );
        }
        const result = await params.run(tx);
        await tx
          .update(agentActionPreviewsDb)
          .set({ usedAt: now })
          .where(eq(agentActionPreviewsDb.id, preview.id));
        return result;
      },
      { isolationLevel: "serializable" }
    );
  }

  async audit(params: {
    actorId: string;
    clientId?: string;
    durationMs?: number;
    errorCode?: string;
    operation: string;
    requestId?: string;
    status: "failure" | "success";
    targetId?: string;
    organizationId?: string;
  }) {
    await this.database.db.insert(agentAuditEventsDb).values({
      ...params,
      createdAt: new Date(),
      id: createId("audit"),
    });
  }

  private async persistResult<T>(id: string, operation: string, response: T) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RESULT_WRITE_ATTEMPTS; attempt += 1) {
      try {
        await this.database.db
          .update(agentIdempotencyDb)
          .set({ response, status: "complete" })
          .where(eq(agentIdempotencyDb.id, id));
        return;
      } catch (error) {
        lastError = error;
        if (attempt < RESULT_WRITE_ATTEMPTS) {
          await wait(attempt * 20);
        }
      }
    }
    const error = asError(lastError, "Idempotency result write failed");
    useLogger().error(error, {
      agentIdempotency: {
        operation,
        recordId: id,
        write: "completion_failed",
      },
    });
    throw error;
  }
}

export function fingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)) ?? "undefined")
    .digest("base64url");
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
