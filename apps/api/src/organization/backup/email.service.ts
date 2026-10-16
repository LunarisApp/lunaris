import { DatabaseService } from "@app/db";
import { RESEND_CLIENT } from "@app/resend";
import { Inject, Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { createLogger } from "evlog";
import type { Resend } from "resend";
import { AppConfig } from "../../app.config";
import { member, organization, user } from "../../auth/auth.entity";
import { backupExportsDb } from "./backup.entity";

const MAX_NOTIFICATION_ATTEMPTS = 3;

@Injectable()
export class BackupEmailService {
  private running = false;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly appConfig: AppConfig,
    @Inject(RESEND_CLIENT) private readonly resend: Resend | null
  ) {}

  @Interval(30_000)
  async sendNext() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.databaseService.db
        .update(backupExportsDb)
        .set({ notificationStatus: "failed" })
        .where(
          and(
            eq(backupExportsDb.notificationStatus, "processing"),
            lt(
              backupExportsDb.notificationLastAttemptAt,
              new Date(Date.now() - 2 * 60 * 1000)
            )
          )
        );
      const backup = await this.claimNext();
      if (!backup) {
        return;
      }
      const log = createLogger({ task: "backup-notification" });
      log.set({
        backup: {
          id: backup.id,
          notificationAttempt: backup.notificationAttempts,
        },
        organization: { id: backup.organizationId },
        user: { id: backup.requestedByUserId },
      });

      try {
        const recipient = await this.databaseService.db
          .select({
            email: user.email,
            name: user.name,
            organizationName: organization.name,
            organizationSlug: organization.slug,
            role: member.role,
          })
          .from(backupExportsDb)
          .innerJoin(
            organization,
            eq(organization.id, backupExportsDb.organizationId)
          )
          .innerJoin(user, eq(user.id, backupExportsDb.requestedByUserId))
          .innerJoin(
            member,
            and(
              eq(member.organizationId, backupExportsDb.organizationId),
              eq(member.userId, backupExportsDb.requestedByUserId)
            )
          )
          .where(eq(backupExportsDb.id, backup.id))
          .limit(1)
          .then((rows) => rows[0]);

        if (recipient?.role !== "owner" || !backup.expiresAt) {
          await this.markNotification(backup.id, "skipped");
          log.set({ backup: { notificationStatus: "skipped" } });
          return;
        }

        const email = buildBackupReadyEmail({
          backupId: backup.id,
          expiresAt: backup.expiresAt,
          frontendUrl: this.appConfig.frontendUrl,
          organizationName: recipient.organizationName,
          organizationSlug: recipient.organizationSlug,
          recipientName: recipient.name,
        });

        if (!this.resend) {
          log.set({
            backup: {
              downloadPageUrl: email.downloadPageUrl,
              notificationStatus: "skipped",
            },
          });
          log.warn("Resend not configured; backup-ready email skipped");
          await this.markNotification(backup.id, "skipped");
          return;
        }

        try {
          await this.resend.emails.send({
            from: "Lunaris <noreply@mail.lunaris.app>",
            replyTo: "Lunaris <hello@lunaris.app>",
            to: recipient.email,
            subject: email.subject,
            html: email.html,
          });
          await this.markNotification(backup.id, "sent");
          log.set({ backup: { notificationStatus: "sent" } });
        } catch (error) {
          await this.markNotification(backup.id, "failed");
          log.set({ backup: { notificationStatus: "failed" } });
          log.error(asError(error));
        }
      } catch (error) {
        await this.markNotification(backup.id, "failed");
        log.set({ backup: { notificationStatus: "failed" } });
        log.error(asError(error));
      } finally {
        log.emit();
      }
    } finally {
      this.running = false;
    }
  }

  private claimNext() {
    return this.databaseService.db.transaction(async (tx) => {
      const backup = await tx
        .select()
        .from(backupExportsDb)
        .where(
          and(
            eq(backupExportsDb.status, "ready"),
            inArray(backupExportsDb.notificationStatus, ["pending", "failed"]),
            lt(backupExportsDb.notificationAttempts, MAX_NOTIFICATION_ATTEMPTS)
          )
        )
        .orderBy(asc(backupExportsDb.completedAt))
        .limit(1)
        .for("update", { skipLocked: true })
        .then((rows) => rows[0]);
      if (!backup) {
        return null;
      }

      return tx
        .update(backupExportsDb)
        .set({
          notificationAttempts: backup.notificationAttempts + 1,
          notificationLastAttemptAt: new Date(),
          notificationStatus: "processing",
        })
        .where(eq(backupExportsDb.id, backup.id))
        .returning()
        .then((rows) => rows[0]!);
    });
  }

  private async markNotification(
    backupId: string,
    status: "failed" | "sent" | "skipped"
  ) {
    await this.databaseService.db
      .update(backupExportsDb)
      .set({ notificationStatus: status })
      .where(eq(backupExportsDb.id, backupId));
  }
}

export function buildBackupReadyEmail(params: {
  backupId: string;
  expiresAt: Date;
  frontendUrl: string;
  organizationName: string;
  organizationSlug: string;
  recipientName: string;
}) {
  const url = new URL(
    `/${encodeURIComponent(params.organizationSlug)}/settings`,
    params.frontendUrl
  );
  url.searchParams.set("tab", "backups");
  url.searchParams.set("backup", params.backupId);
  const downloadPageUrl = url.toString();
  const recipientName = escapeHtml(params.recipientName);
  const organizationName = escapeHtml(params.organizationName);
  const safeUrl = escapeHtml(downloadPageUrl);
  const expiresAt = escapeHtml(
    params.expiresAt.toLocaleString("en-US", {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      timeZone: "UTC",
      timeZoneName: "short",
      year: "numeric",
    })
  );

  return {
    downloadPageUrl,
    subject: `Your ${sanitizeEmailSubject(params.organizationName)} backup is ready`,
    html: `<p>Hi ${recipientName},</p>
<p>Your backup for <strong>${organizationName}</strong> is ready.</p>
<p><a href="${safeUrl}">Open backup download</a></p>
<p>This backup expires ${expiresAt}. Sign in as an organization owner to download it.</p>
<p>If you did not request this backup, you can ignore this email.</p>`,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeEmailSubject(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
