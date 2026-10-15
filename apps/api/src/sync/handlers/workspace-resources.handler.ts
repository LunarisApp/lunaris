import type { DatabaseOrTx } from "@app/db/utils";
import { permission } from "@repo/auth/permissions";
import { eq } from "drizzle-orm";
import { workspaceResourcesDb } from "../../workspaces/resources/workspace-resources.entity";
import {
  assertValidWorkspaceResourceParent,
  getWorkspaceResource,
} from "../../workspaces/resources/workspace-resources.validation";
import { verifyChildOwnership, verifyWorkspaceOwnership } from "../sync.auth";
import type { EntityHandler } from "../sync.handlers";

async function patchWorkspaceResource(
  db: DatabaseOrTx,
  id: string,
  mapped: Record<string, unknown>
) {
  if (!Object.hasOwn(mapped, "parentId")) {
    await db
      .update(workspaceResourcesDb)
      .set({ ...mapped, syncedUpdatedAt: new Date() })
      .where(eq(workspaceResourcesDb.id, id));
    return;
  }

  await db.transaction(async (tx) => {
    const item = await getWorkspaceResource(tx, id, { lock: true });
    if (!item) return;

    await assertValidWorkspaceResourceParent({
      tx,
      resourceId: id,
      lockAncestors: true,
      parentId: mapped.parentId as string | null | undefined,
      workspaceId: item.workspaceId,
    });

    await tx
      .update(workspaceResourcesDb)
      .set({ ...mapped, syncedUpdatedAt: new Date() })
      .where(eq(workspaceResourcesDb.id, id));
  });
}

export const workspaceResourcesHandler: EntityHandler = {
  table: workspaceResourcesDb,
  idCol: workspaceResourcesDb.id,
  permissions: {
    DELETE: permission.content.delete,
    PATCH: permission.content.write,
    PUT: permission.content.write,
  },
  immutableKeys: ["workspaceId", "createdAt"],
  authorize: async (tx, op, id, data, organizationId, userId) => {
    if (op === "PUT") {
      const workspaceId = data?.workspaceId as string;
      await verifyWorkspaceOwnership(tx, workspaceId, organizationId, userId);
      await assertValidWorkspaceResourceParent({
        tx,
        resourceId: id,
        parentId: data?.parentId as string | null | undefined,
        workspaceId,
      });
    } else {
      await verifyChildOwnership(
        tx,
        workspaceResourcesDb,
        workspaceResourcesDb.id,
        id,
        organizationId,
        userId,
      );
    }
  },
  patch: patchWorkspaceResource,
};
