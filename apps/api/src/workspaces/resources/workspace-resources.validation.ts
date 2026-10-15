import type { DatabaseOrTx } from "@app/db/utils";
import { NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { InvalidParentError } from "../../sync/sync.errors";
import {
  workspaceResourcesDb,
  workspaceResourceTrashDb,
} from "./workspace-resources.entity";

export async function getWorkspaceResource(
  tx: DatabaseOrTx,
  id: string,
  options: { lock?: boolean; workspaceId?: string } = {},
) {
  const { lock = false, workspaceId } = options;
  const query = tx
    .select({
      id: workspaceResourcesDb.id,
      parentId: workspaceResourcesDb.parentId,
      workspaceId: workspaceResourcesDb.workspaceId,
      updatedAt: workspaceResourcesDb.updatedAt,
    })
    .from(workspaceResourcesDb)
    .where(
      and(
        eq(workspaceResourcesDb.id, id),
        workspaceId === undefined
          ? undefined
          : eq(workspaceResourcesDb.workspaceId, workspaceId),
      ),
    );

  const rows = lock ? await query.for("update") : await query;
  return rows[0];
}

export async function assertValidWorkspaceResourceParent(params: {
  resourceId: string;
  lockAncestors?: boolean;
  parentId: string | null | undefined;
  workspaceId: string;
  tx: DatabaseOrTx;
}) {
  const { tx, resourceId, lockAncestors = false, parentId, workspaceId } = params;
  if (parentId == null) return;

  if (parentId === resourceId) {
    throw new InvalidParentError(resourceId, parentId, "resource cannot parent itself");
  }

  const parent = await getWorkspaceResource(tx, parentId, {
    lock: lockAncestors,
    workspaceId,
  });
  if (!parent || parent.workspaceId !== workspaceId) {
    throw new NotFoundException("Workspace resource parent not found");
  }
  const [trashedParent] = await tx
    .select({ id: workspaceResourceTrashDb.id })
    .from(workspaceResourceTrashDb)
    .where(eq(workspaceResourceTrashDb.id, parentId));
  if (trashedParent) {
    throw new NotFoundException("Workspace resource parent not found");
  }

  const visited = new Set<string>([resourceId]);
  let currentParent = parent;

  while (currentParent) {
    if (visited.has(currentParent.id)) {
      throw new InvalidParentError(
        resourceId,
        parentId,
        "parent ancestry contains a cycle",
      );
    }

    visited.add(currentParent.id);
    if (currentParent.parentId == null) return;
    const ancestor = await getWorkspaceResource(tx, currentParent.parentId, {
      lock: lockAncestors,
      workspaceId,
    });
    if (!ancestor) {
      throw new NotFoundException("Workspace resource parent not found");
    }
    currentParent = ancestor;
  }
}
