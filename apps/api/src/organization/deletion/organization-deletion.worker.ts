import { fileObjectsDb, uploadSessionsDb } from "../../files/file-storage.entity";
import { buildOrganizationDeletionEmail } from "./organization-deletion.email";
import { AppConfig } from "../../app.config";
import { DatabaseService } from "@app/db";
import type { DatabaseOrTx } from "@app/db/utils";
import { POLAR_CLIENT } from "@app/polar";
import { RESEND_CLIENT } from "@app/resend";
import { StorageService } from "@app/storage";
import { Inject, Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { Polar } from "@polar-sh/sdk";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { createLogger } from "evlog";
import type { Resend } from "resend";
import { member, organization, session, user } from "../../auth/auth.entity";
import {
  agentActionPreviewsDb,
  agentAuditEventsDb,
} from "../../agents/control/agent-control.entity";
import { subscription } from "../../entitlements/billing/subscription.entity";
import { AuditActions } from "../../audit/recording/audit.actions";
import { recordStandaloneComplianceAudit } from "../../audit/recording/audit-log";
import { backupExportsDb } from "../backup/backup.entity";
import { organizationDeletionsDb } from "./organization-deletion.entity";

type Deletion = typeof organizationDeletionsDb.$inferSelect;

@Injectable()
export class OrganizationDeletionWorker {
  private running = false;
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    @Inject(POLAR_CLIENT) private readonly polar: Polar | null,
    @Inject(RESEND_CLIENT) private readonly resend: Resend | null,
    private readonly appConfig: AppConfig,
  ) {}

  async onModuleInit() {
    // Object-storage ledger survives restoring an older PostgreSQL backup.
    // Reapply suspension before Nest starts accepting requests.
    for await (const object of this.storage.listObjects(
      "organization-deletions/",
    )) {
      if (!object.key.endsWith(".json")) continue;
      const organizationId = decodeURIComponent(
        object.key.slice("organization-deletions/".length, -5),
      );
      await this.database.db.transaction(async (tx) => {
        const [org] = await tx
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, organizationId))
          .for("update");
        if (!org) return;
        const now = new Date();
        await tx
          .insert(organizationDeletionsDb)
          .values({
            organizationId,
            requestedAt: now,
            purgeAfter: now,
            purgeStartedAt: now,
          })
          .onConflictDoUpdate({
            target: organizationDeletionsDb.organizationId,
            set: { purgeStartedAt: now, completedAt: null },
          });
        await tx
          .update(organization)
          .set({ deletionRequestedAt: now, deletionPurgeAfter: now })
          .where(eq(organization.id, organizationId));
      });
    }
  }

  @Interval(60_000)
  async processPending() {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.database.db
        .select()
        .from(organizationDeletionsDb)
        .where(isNull(organizationDeletionsDb.completedAt));
      for (const row of rows) {
        const log = createLogger({
          task: "organization-deletion",
          organization: { id: row.organizationId },
        });
        let purged = false;
        try {
          // Commit irreversible phase before any external deletion. Crash retries
          // cannot reopen the restore window after some objects were removed.
          await this.database.db.transaction(async (tx) => {
            if (!(await this.lockOrganization(tx, row.organizationId))) return;
            const [current] = await tx
              .select()
              .from(organizationDeletionsDb)
              .where(
                eq(organizationDeletionsDb.organizationId, row.organizationId),
              )
              .for("update");
            if (
              current &&
              !current.completedAt &&
              !current.purgeStartedAt &&
              current.purgeAfter.getTime() <= Date.now()
            ) {
              await tx
                .update(organizationDeletionsDb)
                .set({ purgeStartedAt: new Date() })
                .where(
                  eq(
                    organizationDeletionsDb.organizationId,
                    row.organizationId,
                  ),
                );
            }
          });
          await this.database.db.transaction(async (tx) => {
            if (!(await this.lockOrganization(tx, row.organizationId))) return;
            const [current] = await tx
              .select()
              .from(organizationDeletionsDb)
              .where(
                eq(organizationDeletionsDb.organizationId, row.organizationId),
              )
              .for("update");
            if (!current || current.completedAt) return;
            // Reconcile every pass: a previously opened customer portal may have
            // re-enabled renewal since the previous cancellation.
            try {
              await this.stopRenewals(
                tx,
                current.organizationId,
                Boolean(current.purgeStartedAt),
              );
              await tx
                .update(organizationDeletionsDb)
                .set({ billingStoppedAt: new Date() })
                .where(
                  eq(
                    organizationDeletionsDb.organizationId,
                    current.organizationId,
                  ),
                );
            } catch (error) {
              // Billing failure must not suppress the security notice. Purge
              // still requires successful cancellation/revocation.
              if (current.purgeStartedAt) throw error;
              log.error(
                error instanceof Error ? error : new Error(String(error)),
              );
            }
            if (current.purgeStartedAt) {
              await this.purge(tx, current.organizationId);
              purged = true;
              log.set({ deletion: { outcome: "purged" } });
            } else {
              try {
                await this.notifyOwners(tx, current);
              } catch (error) {
                // Preserve successful billing reconciliation if email fails.
                log.error(
                  error instanceof Error ? error : new Error(String(error)),
                );
              }
              log.set({
                deletion: {
                  outcome: "scheduled",
                  purgeAfter: current.purgeAfter.toISOString(),
                },
              });
            }
          });
          if (purged)
            recordStandaloneComplianceAudit(
              AuditActions.organizationPurged({
                actor: { type: "system", id: "organization-deletion-worker" },
                target: {
                  id: row.organizationId,
                  tenantId: row.organizationId,
                },
                outcome: "success",
              }),
            );
        } catch (error) {
          log.error(error instanceof Error ? error : new Error(String(error)));
        } finally {
          log.emit();
        }
      }
    } catch (error) {
      const log = createLogger({ task: "organization-deletion-poll" });
      log.error(error instanceof Error ? error : new Error(String(error)));
      log.emit();
    } finally {
      this.running = false;
    }
  }

  private async lockOrganization(tx: DatabaseOrTx, organizationId: string) {
    const [org] = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .for("update", { skipLocked: true });
    return org;
  }

  private async stopRenewals(
    tx: DatabaseOrTx,
    organizationId: string,
    revoke = false,
  ) {
    if (!this.polar) {
      const [paid] = await tx
        .select({ id: subscription.polarSubscriptionId })
        .from(subscription)
        .where(
          and(
            eq(subscription.organizationId, organizationId),
            inArray(subscription.status, ["active", "trialing"]),
          ),
        );
      if (paid)
        throw new Error(
          "Cannot cancel organization subscription: Polar unavailable",
        );
      return;
    }
    const pages = await this.polar.subscriptions.list({
      active: true,
      limit: 100,
      metadata: { referenceId: organizationId },
    });
    for await (const page of pages) {
      for (const remote of page.result.items) {
        if (revoke) {
          await this.polar.subscriptions.revoke({ id: remote.id });
          continue;
        }
        if (!remote.cancelAtPeriodEnd)
          await this.polar.subscriptions.update({
            id: remote.id,
            subscriptionUpdate: { cancelAtPeriodEnd: true },
          });
      }
    }
  }

  private async notifyOwners(
    tx: DatabaseOrTx,
    deletion: Deletion,
  ) {
    if (!this.resend) return;
    const reminder = Boolean(deletion.notifiedAt);
    if (
      reminder &&
      (deletion.reminderSentAt ||
        deletion.purgeAfter.getTime() - Date.now() > 3 * 24 * 60 * 60 * 1000)
    )
      return;
    const [org] = await tx.select({ name: organization.name, slug: organization.slug })
      .from(organization).where(eq(organization.id, deletion.organizationId));
    if (!org) return;
    const recoveryUrl = new URL(`/${encodeURIComponent(org.slug)}`, this.appConfig.frontendUrl);
    recoveryUrl.searchParams.set("region", this.appConfig.appRegion);
    const owners = await tx
      .select({ id: user.id, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, deletion.organizationId),
          eq(member.role, "owner"),
        ),
      );
    // Keep content stable across retries, including when billing recovers.
    for (const owner of owners) {
      const result = await this.resend.emails.send(
        {
          from: "Lunaris <noreply@mail.lunaris.app>",
          to: owner.email,
          ...buildOrganizationDeletionEmail({
            organizationName: org.name,
            purgeAfter: deletion.purgeAfter,
            recoveryUrl: recoveryUrl.toString(),
            reminder,
          }),
        },
        {
          idempotencyKey: `org-deletion/${deletion.organizationId}/${deletion.requestedAt.getTime()}/${reminder ? "reminder" : "scheduled"}/${owner.id}`,
        },
      );
      if (result.error)
        throw new Error(
          `Deletion notification failed: ${result.error.message}`,
        );
    }
    await tx
      .update(organizationDeletionsDb)
      .set(
        reminder ? { reminderSentAt: new Date() } : { notifiedAt: new Date() },
      )
      .where(
        eq(organizationDeletionsDb.organizationId, deletion.organizationId),
      );
  }

  private async purge(tx: DatabaseOrTx, organizationId: string) {
    const [runningBackup] = await tx
      .select({ id: backupExportsDb.id })
      .from(backupExportsDb)
      .where(
        and(
          eq(backupExportsDb.organizationId, organizationId),
          eq(backupExportsDb.status, "processing"),
          or(
            isNull(backupExportsDb.leaseExpiresAt),
            gt(backupExportsDb.leaseExpiresAt, new Date()),
          ),
        ),
      )
      .limit(1);
    if (runningBackup)
      throw new Error("Waiting for in-flight backup before organization purge");
    // Prefixes include delimiter, never delete a neighboring organization's keys.
    // Object removal precedes DB cascades; retries retain all cleanup metadata.
    await this.storage.putObject(
      `organization-deletions/${encodeURIComponent(organizationId)}.json`,
      JSON.stringify({ organizationId }),
      "application/json",
    );
    const uploads = await tx.select().from(uploadSessionsDb).where(eq(uploadSessionsDb.organizationId, organizationId));
    for (const upload of uploads) {
      if (upload.state === "completed" || upload.state === "canceled") continue;
      await this.storage.abortMultipartForKey(upload.objectKey);
      await this.storage.deleteObject(upload.objectKey);
      await tx.update(uploadSessionsDb).set({ state: "canceled", reservedBytes: 0 }).where(eq(uploadSessionsDb.id, upload.id));
    }
    for (const prefix of [
      `files/${organizationId}/`,
      `backups/${organizationId}/`,
    ]) {
      for await (const object of this.storage.listObjects(prefix))
        await this.storage.deleteObject(object.key);
    }
    await tx.update(fileObjectsDb).set({ state: "deleted", verifiedAt: new Date() })
      .where(eq(fileObjectsDb.organizationId, organizationId));
    await tx
      .update(session)
      .set({ activeOrganizationId: null, activeTeamId: null })
      .where(eq(session.activeOrganizationId, organizationId));
    await tx
      .delete(subscription)
      .where(eq(subscription.organizationId, organizationId));
    await tx
      .delete(agentActionPreviewsDb)
      .where(eq(agentActionPreviewsDb.organizationId, organizationId));
    await tx
      .delete(agentAuditEventsDb)
      .where(eq(agentAuditEventsDb.organizationId, organizationId));
    // Workspaces cascade to resources, storage, Yjs, extensions, and memberships.
    await tx.delete(organization).where(eq(organization.id, organizationId));
    await tx
      .update(organizationDeletionsDb)
      .set({ completedAt: new Date(), requestedBy: null })
      .where(eq(organizationDeletionsDb.organizationId, organizationId));
  }
}
