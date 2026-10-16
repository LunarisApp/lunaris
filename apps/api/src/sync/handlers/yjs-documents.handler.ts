import { permission } from "@repo/auth/permissions";
import { yjsDocumentsDb } from "../../yjs/yjs.entity";
import { verifyChildOwnership, verifyWorkspaceOwnership } from "../sync.auth";
import type { EntityHandler } from "../sync.handlers";

export const yjsDocumentsHandler: EntityHandler = {
  table: yjsDocumentsDb,
  idCol: yjsDocumentsDb.id,
  permissions: {
    DELETE: permission.content.delete,
    PATCH: permission.content.write,
    PUT: permission.content.write,
  },
  immutableKeys: ["workspaceId", "createdAt"],
  authorize: async (tx, op, id, data, organizationId, userId) => {
    if (op === "PUT") {
      await verifyWorkspaceOwnership(
        tx,
        data?.workspaceId as string,
        organizationId,
        userId
      );
    } else {
      await verifyChildOwnership(
        tx,
        yjsDocumentsDb,
        yjsDocumentsDb.id,
        id,
        organizationId,
        userId
      );
    }
  },
};
