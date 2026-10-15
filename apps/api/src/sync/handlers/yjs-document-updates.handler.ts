import { permission } from "@repo/auth/permissions";
import { yjsDocumentUpdatesDb } from "../../yjs/yjs.entity";
import { verifyChildOwnership, verifyWorkspaceOwnership } from "../sync.auth";
import { ImmutableOperationError } from "../sync.errors";
import type { EntityHandler } from "../sync.handlers";

export const yjsDocumentUpdatesHandler: EntityHandler = {
  table: yjsDocumentUpdatesDb,
  idCol: yjsDocumentUpdatesDb.id,
  permissions: {
    DELETE: permission.content.write,
    PATCH: permission.content.write,
    PUT: permission.content.write,
  },
  /** Decode base64 updateB64 → Buffer updateData for yjs_document_updates. */
  transform: (mapped) => {
    if (typeof mapped.updateB64 === "string") {
      mapped.updateData = Buffer.from(mapped.updateB64, "base64");
      delete mapped.updateB64;
    }
  },
  authorize: async (tx, op, id, data, organizationId, userId) => {
    if (op === "PATCH") {
      throw new ImmutableOperationError("yjs_document_updates", "PATCH");
    }
    if (op === "PUT") {
      await verifyWorkspaceOwnership(
        tx,
        data?.workspaceId as string,
        organizationId,
        userId,
      );
    } else {
      await verifyChildOwnership(
        tx,
        yjsDocumentUpdatesDb,
        yjsDocumentUpdatesDb.id,
        id,
        organizationId,
        userId,
      );
    }
  },
};
