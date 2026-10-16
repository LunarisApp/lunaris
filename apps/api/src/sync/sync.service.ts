import { DatabaseService } from "@app/db";
import { type DatabaseOrTx, DrizzleDatabase } from "@app/db/utils";
import { BadRequestError } from "@app/utils/errors";
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Auth } from "@repo/auth/server";
import type { SyncAccessPolicy } from "@repo/auth/sync-access";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { PgTimestamp } from "drizzle-orm/pg-core";
import { useLogger } from "evlog/nestjs";
import type { z } from "zod";
import { organization } from "../auth/auth.entity";
import { EntitlementsService } from "../entitlements";
import { PermissionService } from "../security/permissions/permission.service";
import { workspaceResourceTrashDb } from "../workspaces/resources/workspace-resources.entity";
import { UnknownTableError } from "./sync.errors";
import { HANDLERS } from "./sync.handlers";
import type { syncRequestSchema } from "./sync.schema";

type SyncRequest = z.infer<typeof syncRequestSchema>;
type Transaction = SyncRequest["transactions"][number];
type CrudEntry = Transaction["crud"][number];

/**
 * PowerSync sync credentials are bounded to `JWT_TTL` so membership or session
 * access changes propagate within the refresh window.
 * `REFRESH_SLACK_SECONDS` is the reported `expiresAt` buffer before the real
 * JWT expiry — gives the PowerSync SDK time to call `fetchCredentials`
 * before any in-flight request hits 401. Both values are sourced from a
 * single base so a later TTL tweak cannot drift the slack window.
 */
const JWT_TTL_SECONDS = 300; // 5m
const JWT_TTL = "5m" as const; // Better Auth `expirationTime` — must equal JWT_TTL_SECONDS
const REFRESH_SLACK_SECONDS = 60;
/** Map PowerSync snake_case keys to Drizzle camelCase fields. */
function snakeToCamel(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camel] = value;
  }
  return result;
}

/** Convert string timestamps to Date objects for Drizzle timestamp columns. */
function coerceTimestamps(table: PgTable, data: Record<string, unknown>) {
  const columns = getTableColumns(table);
  for (const [key, value] of Object.entries(data)) {
    if (
      key in columns &&
      columns[key] instanceof PgTimestamp &&
      typeof value === "string"
    ) {
      data[key] = new Date(value);
    }
  }
}

@Injectable()
export class SyncService {
  private readonly db: DrizzleDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly authService: AuthService<Auth>,
    private readonly entitlements: EntitlementsService,
    private readonly permissions: PermissionService
  ) {
    this.db = databaseService.db;
  }

  async getCredentials(
    userId: string,
    organizationId: string,
    syncAccess: SyncAccessPolicy
  ) {
    const powersyncUrl = process.env.POWERSYNC_URL ?? "";
    const now = Math.floor(Date.now() / 1000);

    // Reported `expiresAt` is set REFRESH_SLACK_SECONDS before the actual JWT
    // expiry so the PowerSync SDK has slack to call `fetchCredentials` and
    // refresh before any in-flight request hits 401. Keep both values wired to
    // the same source so a later TTL tweak cannot drift the slack window.
    const expiresAt = now + JWT_TTL_SECONDS - REFRESH_SLACK_SECONDS;
    const { token } = await this.authService.api.signJWT({
      body: {
        payload: {
          sub: userId,
          aud: powersyncUrl,
          iat: now,
          organization_id: organizationId,
          sync_access: syncAccess,
        },
        overrideOptions: {
          jwt: { expirationTime: JWT_TTL },
        },
      },
    });

    return { token, powersyncUrl, expiresAt };
  }

  async ingest(
    transactions: Transaction[],
    organizationId: string,
    userId?: string
  ) {
    const log = useLogger();
    const ops: Record<string, number> = {};
    const principal = {
      organizationId,
      role: await this.permissions.getOrganizationRole({
        organizationId,
        userId,
      }),
      userId,
    };

    // client transaction
    //   -> authorize every entry
    //   -> apply all writes inside db.transaction(...)
    //   -> first failure aborts the whole client transaction
    //   -> request returns non-2xx
    //   -> frontend keeps upload queue intact for retry
    for (const transaction of transactions) {
      const transactionOps: Record<string, number> = {};
      const committedAudits: Array<() => void> = [];
      const resourceDeleteIds = new Set(
        transaction.crud
          .filter(
            (entry) =>
              entry.type === "workspace_resources" && entry.op === "DELETE"
          )
          .map(({ id }) => id)
      );
      await this.db.transaction(async (tx) => {
        const [activeOrganization] = await tx
          .select({ id: organization.id })
          .from(organization)
          .where(
            and(
              eq(organization.id, organizationId),
              isNull(organization.deletionRequestedAt)
            )
          )
          .for("share");
        if (!activeOrganization) {
          throw new ForbiddenException("Organization is unavailable");
        }
        const existingTrash = resourceDeleteIds.size
          ? await tx
              .select({ id: workspaceResourceTrashDb.id })
              .from(workspaceResourceTrashDb)
              .where(
                inArray(workspaceResourceTrashDb.id, [...resourceDeleteIds])
              )
          : [];
        const purgedResourceIds = new Set(existingTrash.map(({ id }) => id));
        for (const entry of transaction.crud) {
          const key = `${entry.type}.${entry.op}`;
          const audit = await this.processEntry(
            tx,
            entry,
            organizationId,
            userId,
            principal,
            purgedResourceIds
          );
          if (audit) {
            committedAudits.push(audit);
          }
          transactionOps[key] = (transactionOps[key] ?? 0) + 1;
        }
      });

      for (const audit of committedAudits) {
        audit();
      }

      for (const [key, count] of Object.entries(transactionOps)) {
        ops[key] = (ops[key] ?? 0) + count;
      }
    }
    log.set({ sync: { ops } });
  }

  private async processEntry(
    db: DatabaseOrTx,
    entry: CrudEntry,
    organizationId: string,
    userId: string | undefined,
    principal: {
      organizationId: string;
      role: string | null;
      userId: string | undefined;
    },
    purgedResourceIds: ReadonlySet<string>
  ) {
    const { op, type: tableName, id, data } = entry;

    const handler = HANDLERS[tableName];
    if (!handler) {
      useLogger().set({ sync: { unknownTable: tableName } });
      throw new UnknownTableError(tableName);
    }

    // Client activity is an optimistic display hint. Triggers derive authoritative
    // activity from authorized mutations; never require owner rights for a hint.
    const activityTable =
      tableName === "workspaces" || tableName === "workspace_resources";
    if (
      activityTable &&
      op === "PATCH" &&
      data &&
      Object.keys(data).length === 1 &&
      Object.hasOwn(data, "last_activity_at")
    ) {
      return;
    }

    const { table, idCol } = handler;
    await this.permissions.requirePermission(
      handler.permissions[op],
      principal
    );

    if (
      tableName === "workspace_resources" &&
      op === "DELETE" &&
      !purgedResourceIds.has(id)
    ) {
      throw new BadRequestError({
        message: "Workspace resource must be trashed before permanent deletion",
        reason: "validation.failed",
      });
    }

    if (op === "DELETE" && tableName === "workspace_resources") {
      const existing = await db
        .select({ id: idCol })
        .from(table)
        .where(eq(idCol, id));
      if (existing.length === 0) {
        return;
      }
    }
    if (op === "DELETE" && tableName === "workspace_resource_trash") {
      const [existing] = await db
        .select({
          id: workspaceResourceTrashDb.id,
          purgeAt: workspaceResourceTrashDb.purgeAt,
        })
        .from(workspaceResourceTrashDb)
        .where(eq(workspaceResourceTrashDb.id, id));
      if (!existing) {
        return;
      }
      if (!purgedResourceIds.has(id) && existing.purgeAt <= new Date()) {
        throw new BadRequestError({
          message: "Expired workspace resource trash cannot be restored",
          reason: "validation.failed",
        });
      }
    }

    if (op === "PUT") {
      const existing = await db
        .select({ id: idCol })
        .from(table)
        .where(eq(idCol, id));

      if (existing.length > 0) {
        // Authorize against the stored row, then treat replayed creates as done.
        await handler.authorize(
          db,
          "DELETE",
          id,
          undefined,
          organizationId,
          userId
        );
        return;
      }
    }

    // Prepare the data for processing.
    const mapped = snakeToCamel(data ?? {});
    delete mapped.id;
    if (activityTable && op === "PATCH") {
      delete mapped.lastActivityAt;
    }
    handler.transform?.(mapped);
    coerceTimestamps(table, mapped);
    delete mapped.syncedCreatedAt;
    delete mapped.syncedUpdatedAt;

    if (tableName === "yjs_document_updates" && op === "PUT") {
      mapped.userId = userId ?? null;
    }

    if (tableName === "workspace_resources" && op === "PUT") {
      await this.entitlements.assertCanCreateResource(db, organizationId);
    }
    if (
      tableName === "workspace_resource_trash" &&
      op === "DELETE" &&
      !purgedResourceIds.has(id)
    ) {
      await this.entitlements.assertCanCreateResource(db, organizationId);
    }

    // Authorize the operation for the organization before making any changes.
    await handler.authorize(db, op, id, mapped, organizationId, userId);

    // If the handler specifies immutable keys, remove them from the update data for PATCH operations.
    if (op === "PATCH" && handler.immutableKeys) {
      for (const key of handler.immutableKeys) {
        delete mapped[key];
      }
    }

    const audit = await handler.prepareAudit?.(
      db,
      op,
      id,
      mapped,
      organizationId,
      userId
    );

    switch (op) {
      case "PUT":
        if (handler.put) {
          await handler.put(db, id, mapped);
        } else {
          await db.insert(table).values({ id, ...mapped });
        }
        break;
      case "PATCH":
        if (handler.patch) {
          await handler.patch(db, id, mapped);
        } else {
          await db
            .update(table)
            .set({ ...mapped, syncedUpdatedAt: new Date() })
            .where(eq(idCol, id));
        }
        break;
      case "DELETE":
        if (handler.delete) {
          await handler.delete(db, id);
        } else {
          await db.delete(table).where(eq(idCol, id));
        }
        break;
    }
    return audit;
  }
}
