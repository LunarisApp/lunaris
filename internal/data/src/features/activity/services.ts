import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import {
  CLOUD_WORKSPACE_TABLES,
  LOCAL_WORKSPACE_TABLES,
} from "../workspace-storage";

type ActivityScope =
  | { resourceId: string }
  | { storageId: string }
  | { documentId: string }
  | { workspaceId: string };

/** Record persisted user changes without changing metadata revision tokens. */
export async function recordActivity(
  db: DatabaseOrTx,
  scope: ActivityScope,
  at = new Date().toISOString()
) {
  await ensureTx(db, async (tx) => {
    for (const tables of [CLOUD_WORKSPACE_TABLES, LOCAL_WORKSPACE_TABLES]) {
      let resources: string;
      let workspaces: string;
      let id: string;
      if ("resourceId" in scope) {
        id = scope.resourceId;
        resources = `SELECT id FROM ${tables.workspaceResources} WHERE id = ?`;
        workspaces = `SELECT workspace_id FROM ${tables.workspaceResources} WHERE id = ?`;
      } else if ("workspaceId" in scope) {
        id = scope.workspaceId;
        resources = "SELECT NULL WHERE ? IS NULL";
        workspaces = "SELECT ?";
      } else {
        const byDocument = "documentId" in scope;
        id = byDocument ? scope.documentId : scope.storageId;
        const filter = byDocument
          ? "kind = 'yjs' AND backing_id = ?"
          : "id = ?";
        resources = `SELECT resource_id FROM ${tables.workspaceStorageSlots} WHERE ${filter}`;
        workspaces = byDocument
          ? `SELECT workspace_id FROM ${tables.yjsDocuments} WHERE id = ?`
          : `SELECT workspace_id FROM ${tables.workspaceStorageSlots} WHERE ${filter}`;
      }
      if (!("workspaceId" in scope)) {
        await tx.execute(
          `WITH RECURSIVE ancestors(id, parent_id, workspace_id) AS (
             SELECT id, parent_id, workspace_id FROM ${tables.workspaceResources} WHERE id IN (${resources})
             UNION
             SELECT parent.id, parent.parent_id, parent.workspace_id
             FROM ${tables.workspaceResources} parent JOIN ancestors child
               ON parent.id = child.parent_id AND parent.workspace_id = child.workspace_id
           ) UPDATE ${tables.workspaceResources} SET last_activity_at = ?
             WHERE id IN (SELECT id FROM ancestors)
               AND julianday(?) > COALESCE(julianday(last_activity_at), 0)`,
          [id, at, at]
        );
      }
      await tx.execute(
        `UPDATE ${tables.workspaces} SET last_activity_at = ?
         WHERE id IN (${workspaces})
           AND julianday(?) > COALESCE(julianday(last_activity_at), 0)`,
        [at, id, at]
      );
    }
  });
}
