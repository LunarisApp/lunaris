import { DatabaseService } from "@app/db";
import { POSTHOG_CLIENT } from "@app/posthog";
import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { and, asc, eq, lte } from "drizzle-orm";
import { createLogger } from "evlog";
import type { PostHog } from "posthog-node";
import { AuditActions } from "../../audit/recording/audit.actions";
import { recordStandaloneComplianceAudit } from "../../audit/recording/audit-log";
import { workspacesDb } from "../core/workspaces.entity";
import { workspaceResourceTrashDb } from "./workspace-resources.entity";
import { WorkspaceResourcesService } from "./workspace-resources.service";

const PURGE_BATCH_SIZE = 100;

@Injectable()
export class WorkspaceResourceTrashWorker {
  constructor(
    private readonly database: DatabaseService,
    private readonly resources: WorkspaceResourcesService,
    @Inject(POSTHOG_CLIENT) private readonly posthog: PostHog | null
  ) {}

  @Cron("0 * * * *", { name: "workspace-resource-trash-purge" })
  async purgeExpired() {
    const now = new Date();
    const roots = await this.database.db
      .select({
        id: workspaceResourceTrashDb.id,
        organizationId: workspacesDb.organizationId,
        workspaceId: workspaceResourceTrashDb.workspaceId,
      })
      .from(workspaceResourceTrashDb)
      .innerJoin(
        workspacesDb,
        eq(workspacesDb.id, workspaceResourceTrashDb.workspaceId)
      )
      .where(
        and(
          eq(workspaceResourceTrashDb.id, workspaceResourceTrashDb.trashRootId),
          lte(workspaceResourceTrashDb.purgeAt, now)
        )
      )
      .orderBy(
        asc(workspaceResourceTrashDb.purgeAt),
        asc(workspaceResourceTrashDb.id)
      )
      .limit(PURGE_BATCH_SIZE);

    for (const root of roots) {
      try {
        const purged = await this.resources.purgeExpired(
          root.id,
          root.workspaceId,
          root.organizationId,
          now
        );
        if (purged) {
          recordStandaloneComplianceAudit(
            AuditActions.workspaceResourceAutomaticallyPurged({
              actor: { id: "system", type: "system" },
              outcome: "success",
              target: {
                id: root.id,
                workspaceId: root.workspaceId,
                tenantId: root.organizationId,
              },
            }),
            { tenantId: root.organizationId }
          );
          this.posthog?.capture({
            distinctId: root.organizationId,
            event: "explorer_resource_automatically_purged",
            groups: { organization: root.organizationId },
            properties: {
              workspace_id: root.workspaceId,
              resource_id: root.id,
              $process_person_profile: false,
            },
          });
        }
      } catch (error) {
        const logger = createLogger({ task: "workspace-resource-trash-purge" });
        logger.set({
          organization: { id: root.organizationId },
          workspaceResource: {
            resourceId: root.id,
            workspaceId: root.workspaceId,
          },
        });
        logger.error(
          error instanceof Error ? error : new Error("Trash purge failed")
        );
        logger.emit();
      }
    }
  }
}
