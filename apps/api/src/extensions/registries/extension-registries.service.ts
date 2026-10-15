import type { DrizzleTransaction } from "@app/db/utils";
import { DatabaseService, isUniqueViolation } from "@app/db";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  normalizeMarketplaceSource,
  OFFICIAL_MARKETPLACE_ID,
  OFFICIAL_MARKETPLACE_LOCATION,
  OFFICIAL_MARKETPLACE_MANIFEST_URL,
} from "@lunarisapp/plugin-sdk/marketplace";
import { and, asc, eq } from "drizzle-orm";
import { member, organization } from "../../auth/auth.entity";
import { randomUUID } from "node:crypto";
import { workspaceExtensionsDb } from "../../workspaces/extensions/workspace-extensions.entity";
import { workspacesDb } from "../../workspaces/core/workspaces.entity";
import { organizationExtensionRegistriesDb } from "./extension-registries.entity";

@Injectable()
export class ExtensionRegistriesService {
  constructor(private readonly database: DatabaseService) {}

  async requireOwner(organizationId: string, userId: string) {
    const [membership] = await this.database.db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
        ),
      )
      .limit(1);
    if (membership?.role !== "owner") {
      throw new ForbiddenException(
        "Only organization owners can manage developer mode and marketplaces",
      );
    }
  }

  async getDeveloperMode(organizationId: string) {
    const [row] = await this.database.db
      .select({ enabled: organization.developerMode })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!row) throw new NotFoundException("Organization not found");
    return row;
  }

  async setDeveloperMode(organizationId: string, enabled: boolean) {
    const [row] = await this.database.db
      .update(organization)
      .set({ developerMode: enabled })
      .where(eq(organization.id, organizationId))
      .returning({ enabled: organization.developerMode });
    if (!row) throw new NotFoundException("Organization not found");
    return row;
  }

  private async requireDeveloperMode(
    organizationId: string,
    tx: DrizzleTransaction,
  ) {
    // Hold the organization row until the marketplace write commits. Disabling
    // developer mode must wait for writes already authorized under this lock.
    const [row] = await tx
      .select({ enabled: organization.developerMode })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)
      .for("share");
    if (!row) throw new NotFoundException("Organization not found");
    if (!row.enabled)
      throw new ForbiddenException(
        "Enable developer mode to manage custom marketplaces",
      );
  }

  async list(organizationId: string) {
    await this.ensureOfficial(organizationId);
    const rows = await this.database.db
      .select()
      .from(organizationExtensionRegistriesDb)
      .where(
        eq(organizationExtensionRegistriesDb.organizationId, organizationId),
      )
      .orderBy(asc(organizationExtensionRegistriesDb.addedAt));
    return rows.map(mapRegistryRow);
  }

  async add(organizationId: string, url: string, userId: string) {
    let source;
    try {
      source = normalizeMarketplaceSource(url);
    } catch (cause) {
      throw new BadRequestException(
        cause instanceof Error ? cause.message : "Invalid marketplace URL",
      );
    }
    if (source.location === OFFICIAL_MARKETPLACE_LOCATION) {
      throw new ConflictException("Official marketplace is already configured");
    }
    try {
      return await this.database.db.transaction(async (tx) => {
        await this.requireDeveloperMode(organizationId, tx);
        const [row] = await tx
          .insert(organizationExtensionRegistriesDb)
          .values({
            addedBy: userId,
            id: randomUUID(),
            kind: source.kind,
            location: source.location,
            manifestUrl: source.manifestUrl,
            official: false,
            organizationId,
          })
          .returning();
        if (!row) {
          throw new InternalServerErrorException(
            "Marketplace write returned no row",
          );
        }
        return mapRegistryRow(row);
      });
    } catch (cause) {
      if (cause instanceof InternalServerErrorException) throw cause;
      if (isUniqueViolation(cause)) {
        throw new ConflictException("Marketplace source is already configured");
      }
      throw cause;
    }
  }

  async remove(organizationId: string, registryId: string) {
    return this.database.db.transaction(async (tx) => {
      await this.requireDeveloperMode(organizationId, tx);
      const [registry] = await tx
        .select()
        .from(organizationExtensionRegistriesDb)
        .where(
          and(
            eq(
              organizationExtensionRegistriesDb.organizationId,
              organizationId,
            ),
            eq(organizationExtensionRegistriesDb.id, registryId),
          ),
        )
        .limit(1)
        .for("update");
      if (!registry) {
        throw new NotFoundException("Extension marketplace not found");
      }
      if (registry.official) {
        throw new ForbiddenException("Official marketplace cannot be removed");
      }
      const [installation] = await tx
        .select({ extensionId: workspaceExtensionsDb.extensionId })
        .from(workspaceExtensionsDb)
        .innerJoin(
          workspacesDb,
          eq(workspacesDb.id, workspaceExtensionsDb.workspaceId),
        )
        .where(
          and(
            eq(workspacesDb.organizationId, organizationId),
            eq(workspaceExtensionsDb.registryId, registryId),
          ),
        )
        .limit(1);
      if (installation) {
        throw new ConflictException(
          "Uninstall workspace extensions before removing this marketplace",
        );
      }
      await tx
        .delete(organizationExtensionRegistriesDb)
        .where(
          and(
            eq(
              organizationExtensionRegistriesDb.organizationId,
              organizationId,
            ),
            eq(organizationExtensionRegistriesDb.id, registryId),
          ),
        );
      return { registryId };
    });
  }

  private async ensureOfficial(organizationId: string) {
    await this.database.db
      .insert(organizationExtensionRegistriesDb)
      .values({
        id: OFFICIAL_MARKETPLACE_ID,
        kind: "github",
        location: OFFICIAL_MARKETPLACE_LOCATION,
        manifestUrl: OFFICIAL_MARKETPLACE_MANIFEST_URL,
        official: true,
        organizationId,
      })
      .onConflictDoNothing();
  }
}

function mapRegistryRow(
  row: typeof organizationExtensionRegistriesDb.$inferSelect,
) {
  return {
    addedAt: row.addedAt.toISOString(),
    addedBy: row.addedBy,
    id: row.id,
    kind: row.kind,
    location: row.location,
    manifestUrl: row.manifestUrl,
    official: row.official,
    organizationId: row.organizationId,
    updatedAt: row.updatedAt.toISOString(),
  };
}
