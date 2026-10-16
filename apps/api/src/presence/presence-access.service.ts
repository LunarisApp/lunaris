import fileManifest from "@extension/file/manifest.json";
import kanbanManifest from "@extension/kanban/manifest.json";
import richTextManifest from "@extension/rich-text/manifest.json";
import { workspaceExtensionsDb } from "../workspaces/extensions/workspace-extensions.entity";
import { DatabaseService } from "@app/db";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { and, eq, gt, isNull } from "drizzle-orm";
import { session, user } from "../auth/auth.entity";
import { PermissionService } from "../security/permissions/permission.service";
import { assertWorkspaceAccess } from "../workspaces/core/workspace-access";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "../workspaces/resources/workspace-resources.entity";
import { workspaceStorageSlotsDb } from "../workspaces/storage/workspace-storage.entity";
import { yjsDocumentsDb } from "../yjs/yjs.entity";
import type { PresenceTicket } from "./presence-relay";

@Injectable()
export class PresenceAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionService
  ) {}

  async authorize(
    input: Pick<
      PresenceTicket,
      | "organizationId"
      | "workspaceId"
      | "storageId"
      | "sessionId"
      | "kind"
      | "extensionId"
      | "channel"
    > & { userId: string; resourceId?: string }
  ): Promise<PresenceTicket> {
    const db = this.database.db;
    await this.permissions.requirePermission(permission.content.read, input);
    await assertWorkspaceAccess(
      db,
      input.workspaceId,
      input.organizationId,
      input.userId
    );
    const [identity] = await db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(
        and(
          eq(session.id, input.sessionId),
          eq(session.userId, input.userId),
          eq(session.activeOrganizationId, input.organizationId),
          gt(session.expiresAt, new Date())
        )
      )
      .limit(1);
    if (!identity) {
      throw new ForbiddenException("Presence session expired");
    }
    if (input.kind === "resource" || input.kind === "channel") {
      const [resource] = await db
        .select({ id: workspaceResourcesDb.id })
        .from(workspaceResourcesDb)
        .leftJoin(
          workspaceResourceTrashDb,
          eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id)
        )
        .where(
          and(
            eq(workspaceResourcesDb.id, input.resourceId ?? ""),
            eq(workspaceResourcesDb.workspaceId, input.workspaceId),
            isNull(workspaceResourceTrashDb.id)
          )
        )
        .limit(1);
      if (!resource) {
        throw new NotFoundException("Resource not found");
      }
      if (
        input.kind === "channel" &&
        !(
          input.extensionId &&
          /^[a-zA-Z0-9._-]{1,128}$/.test(input.extensionId) &&
          input.channel &&
          /^[a-zA-Z0-9._-]{1,64}$/.test(input.channel)
        )
      ) {
        throw new ForbiddenException("Invalid presence channel");
      }
      if (input.kind === "channel") {
        const [extension] = await db
          .select({ id: workspaceExtensionsDb.id })
          .from(workspaceExtensionsDb)
          .where(
            and(
              eq(workspaceExtensionsDb.workspaceId, input.workspaceId),
              eq(workspaceExtensionsDb.extensionId, input.extensionId!),
              eq(workspaceExtensionsDb.enabled, true)
            )
          )
          .limit(1);
        if (!extension) {
          // Empty installation tables use the bundled defaults, as the host does.
          // Once any row exists, the explicit enabled set is authoritative.
          const bundled = [
            fileManifest.id,
            kanbanManifest.id,
            richTextManifest.id,
          ];
          if (!bundled.includes(input.extensionId!)) {
            throw new ForbiddenException("Presence extension unavailable");
          }
          const [configured] = await db
            .select({ id: workspaceExtensionsDb.id })
            .from(workspaceExtensionsDb)
            .where(eq(workspaceExtensionsDb.workspaceId, input.workspaceId))
            .limit(1);
          if (configured) {
            throw new ForbiddenException("Presence extension unavailable");
          }
        }
      }
      return {
        ...input,
        resourceId: resource.id,
        documentId: "",
        storageId: "",
        user: {
          id: identity.id,
          name: identity.name.trim().slice(0, 100),
          image: safeImage(identity.image),
          color: presenceColor(identity.id),
        },
      };
    }
    const [slot] = await db
      .select({
        documentId: yjsDocumentsDb.id,
        resourceId: workspaceResourcesDb.id,
      })
      .from(workspaceStorageSlotsDb)
      .innerJoin(
        workspaceResourcesDb,
        and(
          eq(workspaceResourcesDb.id, workspaceStorageSlotsDb.resourceId),
          eq(workspaceResourcesDb.workspaceId, input.workspaceId)
        )
      )
      .innerJoin(
        yjsDocumentsDb,
        and(
          eq(yjsDocumentsDb.id, workspaceStorageSlotsDb.backingId),
          eq(yjsDocumentsDb.workspaceId, input.workspaceId)
        )
      )
      .leftJoin(
        workspaceResourceTrashDb,
        eq(workspaceResourceTrashDb.id, workspaceResourcesDb.id)
      )
      .where(
        and(
          eq(workspaceStorageSlotsDb.id, input.storageId),
          eq(workspaceStorageSlotsDb.workspaceId, input.workspaceId),
          eq(workspaceStorageSlotsDb.kind, "yjs"),
          isNull(workspaceResourceTrashDb.id)
        )
      )
      .limit(1);
    if (!slot) {
      throw new NotFoundException("Resource storage not found");
    }
    return {
      ...input,
      ...slot,
      user: {
        id: identity.id,
        name: identity.name.trim().slice(0, 100),
        image: safeImage(identity.image),
        color: presenceColor(identity.id),
      },
    };
  }
}

function safeImage(image: string | null): string {
  if (!image) {
    return "";
  }
  try {
    return new URL(image).protocol === "https:" ? image : "";
  } catch {
    return "";
  }
}

function presenceColor(id: string): string {
  const colors = [
    "#b91c1c",
    "#047857",
    "#1d4ed8",
    "#7e22ce",
    "#a16207",
    "#be185d",
  ];
  let hash = 0;
  for (const char of id) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  }
  return colors[(hash >>> 0) % colors.length]!;
}
