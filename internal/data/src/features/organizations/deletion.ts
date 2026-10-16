import type { Database } from "../../core/utils";

const CONTENT_TABLES = [
  "yjs_document_updates",
  "yjs_documents",
  "workspace_storage_values",
  "workspace_storage_slots",
  "workspace_resource_trash",
  "workspace_resources",
  "workspace_extensions",
  "workspace_members",
] as const;

/** Discard scoped pending writes. PowerSync owns removal of replicated rows;
 * deleting those rows locally would leave its checkpoint inconsistent. */
export async function discardOrganizationUploads(
  db: Database,
  organizationId: string,
  serverWorkspaceIds: readonly string[]
) {
  await db.writeTransaction(async (tx) => {
    const local = await tx.getAll<{ id: string }>(
      "SELECT id FROM workspaces WHERE organization_id = ?",
      [organizationId]
    );
    const ids = [
      ...new Set([...serverWorkspaceIds, ...local.map((row) => row.id)]),
    ];
    if (!ids.length) {
      return;
    }
    // JSON table avoids SQLite's bind-parameter limit for large organizations.
    const workspaces = "SELECT value FROM json_each(?)";
    const workspaceIds = JSON.stringify(ids);
    for (const table of CONTENT_TABLES) {
      await tx.execute(
        `DELETE FROM ps_crud WHERE json_extract(data, '$.type') = ? AND (
        json_extract(data, '$.id') IN (SELECT id FROM ${table} WHERE workspace_id IN (${workspaces}))
        OR json_extract(data, '$.data.workspace_id') IN (${workspaces})
      )`,
        [table, workspaceIds, workspaceIds]
      );
    }
    await tx.execute(
      `DELETE FROM ps_crud WHERE json_extract(data, '$.type') = 'workspaces' AND json_extract(data, '$.id') IN (${workspaces})`,
      [workspaceIds]
    );
  });
}
