import { BadRequestError } from "@app/utils/errors";
import { permission } from "@repo/auth/permissions";
import { and, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { AuditActions } from "../../audit/recording/audit.actions";
import { recordStandaloneComplianceAudit } from "../../audit/recording/audit-log";
import { extensionCatalogService } from "../../extensions/registries/extension-catalog.service";
import { organizationExtensionRegistriesDb } from "../../extensions/registries/extension-registries.entity";
import { workspaceExtensionsDb } from "../../workspaces/extensions/workspace-extensions.entity";
import { verifyChildOwnership, verifyWorkspaceOwnership } from "../sync.auth";
import type { EntityHandler } from "../sync.handlers";

const table: PgTable = workspaceExtensionsDb;
const RELEASE_KEYS = [
  "registryId",
  "version",
  "descriptorUrl",
  "descriptorBytes",
  "descriptorSha256",
] as const;

type WorkspaceExtensionAuditRow = {
  descriptorBytes: number | null;
  descriptorSha256: string | null;
  descriptorUrl: string | null;
  extensionId: string;
  workspaceId: string;
  registryId: string | null;
  version: string | null;
};

function auditActor(userId?: string) {
  return userId
    ? { id: userId, type: "user" as const }
    : { id: "system", type: "system" as const };
}

function invalidWorkspaceExtension(why: string): never {
  throw new BadRequestError({
    message: "Invalid workspace extension",
    reason: "validation.failed",
    why,
  });
}

async function validateMarketplaceRelease(
  tx: Parameters<EntityHandler["authorize"]>[0],
  data: Record<string, unknown>,
  organizationId: string
) {
  const registryId = data.registryId;
  const version = data.version;
  const descriptorUrl = data.descriptorUrl;
  const descriptorBytes = data.descriptorBytes;
  const descriptorSha256 = data.descriptorSha256;
  const descriptorValues = [descriptorUrl, descriptorBytes, descriptorSha256];
  const hasDescriptor = descriptorValues.some(
    (value) => value !== null && value !== undefined
  );

  if (registryId == null && version == null && !hasDescriptor) {
    return;
  }
  if (typeof registryId !== "string" || registryId.length === 0) {
    invalidWorkspaceExtension("Marketplace ID is required");
  }
  if (typeof version !== "string" || version.length === 0) {
    invalidWorkspaceExtension("Extension version is required");
  }
  if (data.enabled !== true) {
    invalidWorkspaceExtension("Marketplace extensions must be enabled");
  }
  if (
    hasDescriptor &&
    (typeof descriptorUrl !== "string" ||
      typeof descriptorBytes !== "number" ||
      !Number.isInteger(descriptorBytes) ||
      descriptorBytes < 0 ||
      typeof descriptorSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(descriptorSha256))
  ) {
    invalidWorkspaceExtension("Extension descriptor provenance is incomplete");
  }

  const [registry] = await tx
    .select()
    .from(organizationExtensionRegistriesDb)
    .where(
      and(
        eq(organizationExtensionRegistriesDb.organizationId, organizationId),
        eq(organizationExtensionRegistriesDb.id, registryId)
      )
    )
    .limit(1)
    .for("share");
  if (!registry) {
    invalidWorkspaceExtension("Extension marketplace was not found");
  }

  const extensionId = data.extensionId;
  if (typeof extensionId !== "string" || extensionId.length === 0) {
    invalidWorkspaceExtension("Plugin ID is required");
  }
  if (extensionId.startsWith("lunaris.") && !registry.official) {
    invalidWorkspaceExtension("Official extension IDs are reserved");
  }

  const release = await extensionCatalogService.requireActiveVersion(
    registry.manifestUrl,
    extensionId,
    version
  );
  if (
    hasDescriptor &&
    (release.descriptor.url !== descriptorUrl ||
      release.descriptor.bytes !== descriptorBytes ||
      release.descriptor.sha256 !== descriptorSha256)
  ) {
    invalidWorkspaceExtension(
      "Extension provenance does not match marketplace"
    );
  }
}

export const workspaceExtensionsHandler: EntityHandler = {
  table: workspaceExtensionsDb,
  idCol: workspaceExtensionsDb.id,
  permissions: {
    DELETE: permission.content.write,
    PATCH: permission.content.write,
    PUT: permission.content.write,
  },
  immutableKeys: ["workspaceId", "extensionId", "createdAt"],
  transform: (mapped) => {
    if (Object.hasOwn(mapped, "enabled")) {
      mapped.enabled = mapped.enabled === true || mapped.enabled === 1;
    }
  },
  prepareAudit: async (tx, op, id, data, organizationId, userId) => {
    let before: WorkspaceExtensionAuditRow | undefined;
    if (op !== "PUT") {
      [before] = await tx
        .select({
          extensionId: workspaceExtensionsDb.extensionId,
          descriptorBytes: workspaceExtensionsDb.descriptorBytes,
          descriptorSha256: workspaceExtensionsDb.descriptorSha256,
          descriptorUrl: workspaceExtensionsDb.descriptorUrl,
          workspaceId: workspaceExtensionsDb.workspaceId,
          registryId: workspaceExtensionsDb.registryId,
          version: workspaceExtensionsDb.version,
        })
        .from(workspaceExtensionsDb)
        .where(eq(workspaceExtensionsDb.id, id))
        .limit(1);
    }

    const after = { ...before, ...data } as WorkspaceExtensionAuditRow;
    const common = {
      actor: auditActor(userId),
      outcome: "success" as const,
      target: {
        id,
        workspaceId: after.workspaceId ?? before?.workspaceId,
        tenantId: organizationId,
      },
    };

    if (
      (op === "PUT" || (op === "PATCH" && !before?.registryId)) &&
      typeof after.registryId === "string"
    ) {
      return () =>
        recordStandaloneComplianceAudit(
          AuditActions.workspaceExtensionInstalled({
            ...common,
            changes: {
              after: {
                extensionId: after.extensionId,
                registryId: after.registryId,
                version: after.version,
              },
            },
          }),
          { tenantId: organizationId }
        );
    }
    if (op === "DELETE" && before?.registryId) {
      return () =>
        recordStandaloneComplianceAudit(
          AuditActions.workspaceExtensionUninstalled({
            ...common,
            changes: { before },
          }),
          { tenantId: organizationId }
        );
    }
    if (
      op === "PATCH" &&
      before?.registryId &&
      after.registryId &&
      RELEASE_KEYS.some(
        (key) =>
          data && Object.hasOwn(data, key) && after[key] !== before?.[key]
      )
    ) {
      return () =>
        recordStandaloneComplianceAudit(
          AuditActions.workspaceExtensionUpdated({
            ...common,
            changes: {
              after: {
                descriptorBytes: after.descriptorBytes,
                descriptorSha256: after.descriptorSha256,
                descriptorUrl: after.descriptorUrl,
                registryId: after.registryId,
                version: after.version,
              },
              before: {
                descriptorBytes: before?.descriptorBytes,
                descriptorSha256: before?.descriptorSha256,
                descriptorUrl: before?.descriptorUrl,
                registryId: before?.registryId,
                version: before?.version,
              },
            },
          }),
          { tenantId: organizationId }
        );
    }
  },
  put: async (tx, id, mapped) => {
    await tx
      .insert(table)
      .values({ ...mapped, id })
      .onConflictDoUpdate({
        set: { ...mapped, id, syncedUpdatedAt: new Date() },
        target: [
          workspaceExtensionsDb.workspaceId,
          workspaceExtensionsDb.extensionId,
        ],
      });
  },
  authorize: async (tx, op, id, data, organizationId, userId) => {
    if (op === "PUT") {
      if (
        typeof data?.extensionId !== "string" ||
        data.extensionId.length === 0
      ) {
        throw new BadRequestError({
          message: "Invalid workspace extension",
          reason: "validation.failed",
          why: "Plugin ID is required",
        });
      }
      await verifyWorkspaceOwnership(
        tx,
        data?.workspaceId as string,
        organizationId,
        userId
      );
      await validateMarketplaceRelease(tx, data, organizationId);
      return;
    }
    await verifyChildOwnership(
      tx,
      workspaceExtensionsDb,
      workspaceExtensionsDb.id,
      id,
      organizationId,
      userId
    );
    // Offline runtime rollback can leave a queued disable before a later retry.
    // Validate marketplace provenance when enabling or changing the release.
    if (
      op === "PATCH" &&
      data &&
      (RELEASE_KEYS.some((key) => Object.hasOwn(data, key)) ||
        data.enabled === true)
    ) {
      const [existing] = await tx
        .select()
        .from(workspaceExtensionsDb)
        .where(eq(workspaceExtensionsDb.id, id))
        .limit(1);
      if (!existing) {
        invalidWorkspaceExtension("Workspace extension was not found");
      }
      await validateMarketplaceRelease(
        tx,
        { ...existing, ...data },
        organizationId
      );
    }
  },
};
