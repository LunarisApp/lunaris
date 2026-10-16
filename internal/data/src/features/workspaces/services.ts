import { recordActivity } from "../activity/services";
import {
  type AdditionalOptions,
  type QuerySyncStreamOptions,
  useQuery,
  useSuspenseQuery,
} from "@powersync/react";
import {
  normalizeWorkspaceVisibility,
  WORKSPACE_VISIBILITY,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";
import { createId } from "@repo/utils";
import slugify from "slugify";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import {
  buildUnionAllQuery,
  resolveWorkspaceScopedTables,
} from "../workspace-storage";
import type { CreateWorkspaceSchema } from "./schemas";
import {
  LOCAL_WORKSPACES_TABLE,
  WORKSPACES_TABLE,
  type WorkspaceEntity,
} from "./table";

const WORKSPACE_COLUMNS = `
  id,
  name,
  slug,
  organization_id,
  owner_id,
  visibility,
  created_at,
  updated_at,
  last_activity_at
`;

const WORKSPACES_UNION_QUERY = buildUnionAllQuery(
  `SELECT ${WORKSPACE_COLUMNS} FROM ${WORKSPACES_TABLE}`,
  `SELECT ${WORKSPACE_COLUMNS} FROM ${LOCAL_WORKSPACES_TABLE}`
);

export const WORKSPACE_INDEX_SYNC_STREAMS: QuerySyncStreamOptions[] = [
  { name: "workspace_index", waitForStream: true },
];

function buildWorkspacesQuery(whereClause?: string, orderBy?: string) {
  const where = whereClause ? ` WHERE ${whereClause}` : "";
  const order = orderBy ? ` ORDER BY ${orderBy}` : "";
  return `SELECT * FROM (${WORKSPACES_UNION_QUERY}) workspaces${where}${order}`;
}

function buildQuery(id?: string, organizationId?: string) {
  const conditions: string[] = [];
  const params: string[] = [];

  if (id) {
    conditions.push("id = ?");
    params.push(id);
  }
  if (organizationId) {
    conditions.push("organization_id = ?");
    params.push(organizationId);
  }

  const whereClause =
    conditions.length > 0 ? conditions.join(" AND ") : "1 = 1";
  return {
    query: buildWorkspacesQuery(
      whereClause,
      "MAX(COALESCE(julianday(last_activity_at), 0), COALESCE(julianday(updated_at), 0)) DESC, id ASC"
    ),
    params: params.length > 0 ? params : undefined,
  };
}

export function useWorkspacesQuery(params?: {
  id?: string;
  options?: AdditionalOptions;
  organizationId?: string;
}) {
  const { id, options, organizationId } = params || {};
  const { query, params: queryParams } = buildQuery(id, organizationId);
  return useQuery<WorkspaceEntity>(query, queryParams, options);
}

function buildWorkspaceBySlugQuery(hasParams: boolean) {
  return hasParams
    ? buildWorkspacesQuery("slug = ? AND organization_id = ?")
    : buildWorkspacesQuery("0");
}

export function useWorkspaceBySlugQuery(
  slug?: string,
  organizationId?: string,
  options?: AdditionalOptions
) {
  const hasParams = slug && organizationId;
  return useQuery<WorkspaceEntity>(
    buildWorkspaceBySlugQuery(Boolean(hasParams)),
    hasParams ? [slug, organizationId] : undefined,
    options
  );
}

export function useWorkspaceSlugCollision(params: {
  excludeWorkspaceId?: string;
  options?: AdditionalOptions;
  organizationId?: string;
  slug?: string;
}) {
  const { excludeWorkspaceId, options, organizationId, slug } = params;
  const query = useWorkspaceBySlugQuery(slug?.trim(), organizationId, options);
  const hasCollision =
    query.data?.some((workspace) => workspace.id !== excludeWorkspaceId) ??
    false;

  return {
    ...query,
    hasCollision,
  };
}

export function useWorkspaceBySlugSuspenseQuery(
  slug?: string,
  organizationId?: string,
  options?: AdditionalOptions
) {
  const hasParams = slug && organizationId;
  return useSuspenseQuery<WorkspaceEntity>(
    buildWorkspaceBySlugQuery(Boolean(hasParams)),
    hasParams ? [slug, organizationId] : undefined,
    options
  );
}

export function useWorkspacesSuspenseQuery(params?: {
  id?: string;
  options?: AdditionalOptions;
  organizationId?: string;
}) {
  const { id, options, organizationId } = params || {};
  const { query, params: queryParams } = buildQuery(id, organizationId);
  return useSuspenseQuery<WorkspaceEntity>(query, queryParams, options);
}

export async function createWorkspace(
  params: { db: DatabaseOrTx } & CreateWorkspaceSchema
) {
  const {
    db,
    name,
    slug: customSlug,
    organizationId,
    visibility = WORKSPACE_VISIBILITY.shared,
  } = params;
  const id = createId("workspace");
  const slug = customSlug || slugify(name, { lower: true, strict: true });
  const createdAt = new Date().toISOString();
  const tableName = resolveWorkspaceScopedTables(visibility).workspaces;

  await db.execute(
    `INSERT INTO ${tableName} (id, name, slug, organization_id, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name, slug, organizationId, visibility, createdAt, createdAt]
  );

  return id;
}

export function getWorkspace(params: { db: DatabaseOrTx; id: string }) {
  const { db, id } = params;
  return db.getOptional<WorkspaceEntity>(buildWorkspacesQuery("id = ?"), [id]);
}

export async function resolveWorkspaceVisibility(
  db: DatabaseOrTx,
  workspaceId: string
): Promise<WorkspaceVisibility> {
  const workspace = await getWorkspace({ db, id: workspaceId });
  return (
    normalizeWorkspaceVisibility(workspace?.visibility) ??
    WORKSPACE_VISIBILITY.shared
  );
}

export function getAllWorkspaces({ db }: { db: DatabaseOrTx }) {
  return db.getAll<WorkspaceEntity>(
    buildWorkspacesQuery(
      "1 = 1",
      "MAX(COALESCE(julianday(last_activity_at), 0), COALESCE(julianday(updated_at), 0)) DESC, created_at DESC, id ASC"
    )
  );
}

export async function removeWorkspace(params: {
  db: DatabaseOrTx;
  id: string;
}) {
  const { db, id } = params;
  const [result] = await Promise.all([
    db.execute(`DELETE FROM ${WORKSPACES_TABLE} WHERE id = ?`, [id]),
    db.execute(`DELETE FROM ${LOCAL_WORKSPACES_TABLE} WHERE id = ?`, [id]),
  ]);
  return result;
}

export async function renameWorkspace(params: {
  db: DatabaseOrTx;
  id: string;
  name: string;
  slug: string;
}) {
  return ensureTx(params.db, async (db) => {
    const { id, name, slug } = params;
    const updatedAt = new Date().toISOString();
    const [result] = await Promise.all([
      db.execute(
        `UPDATE ${WORKSPACES_TABLE} SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
        [name, slug, updatedAt, id]
      ),
      db.execute(
        `UPDATE ${LOCAL_WORKSPACES_TABLE} SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
        [name, slug, updatedAt, id]
      ),
    ]);
    await recordActivity(db, { workspaceId: id }, updatedAt);
    return result;
  });
}

export async function migrateLocalWorkspaceToShared(params: {
  db: DatabaseOrTx;
  id: string;
}) {
  const { db, id } = params;
  const cloudTables = resolveWorkspaceScopedTables(WORKSPACE_VISIBILITY.shared);
  const localTables = resolveWorkspaceScopedTables(WORKSPACE_VISIBILITY.local);

  const workspace = await db.getOptional<WorkspaceEntity>(
    `SELECT ${WORKSPACE_COLUMNS} FROM ${LOCAL_WORKSPACES_TABLE} WHERE id = ?`,
    [id]
  );
  if (!workspace) {
    return false;
  }

  await ensureTx(db, async (tx) => {
    await tx.execute(
      `INSERT INTO ${cloudTables.workspaces} (id, name, slug, organization_id, owner_id, visibility, created_at, updated_at, last_activity_at)
       SELECT id, name, slug, organization_id, owner_id, ?, created_at, updated_at, last_activity_at
       FROM ${localTables.workspaces} WHERE id = ?`,
      [WORKSPACE_VISIBILITY.shared, id]
    );

    await tx.execute(
      `INSERT INTO ${cloudTables.workspaceExtensions}
         (id, workspace_id, extension_id, enabled, registry_id, version,
          descriptor_url, descriptor_bytes, descriptor_sha256, created_at, updated_at)
       SELECT id, workspace_id, extension_id, enabled, registry_id, version,
              descriptor_url, descriptor_bytes, descriptor_sha256, created_at, updated_at
       FROM ${localTables.workspaceExtensions} WHERE workspace_id = ?`,
      [id]
    );

    await tx.execute(
      `INSERT INTO ${cloudTables.workspaceResources} (id, workspace_id, name, icon, position, parent_id, resource_type_id, schema_version, created_at, updated_at, last_activity_at)
       SELECT id, workspace_id, name, icon, position, parent_id, resource_type_id, schema_version, created_at, updated_at, last_activity_at
       FROM ${localTables.workspaceResources} WHERE workspace_id = ?`,
      [id]
    );

    await tx.execute(
      `INSERT INTO ${cloudTables.yjsDocuments} (id, workspace_id, created_at, updated_at)
       SELECT id, workspace_id, created_at, updated_at
       FROM ${localTables.yjsDocuments} WHERE workspace_id = ?`,
      [id]
    );

    await tx.execute(
      `INSERT INTO ${cloudTables.yjsDocumentUpdates} (id, workspace_id, document_id, user_id, update_b64, created_at, updated_at)
       SELECT id, workspace_id, document_id, user_id, update_b64, created_at, updated_at
       FROM ${localTables.yjsDocumentUpdates} WHERE workspace_id = ?`,
      [id]
    );

    await tx.execute(
      `INSERT INTO ${cloudTables.workspaceStorageSlots} (id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at)
       SELECT id, workspace_id, resource_id, plugin_id, name, kind, backing_id, metadata, created_at, updated_at
       FROM ${localTables.workspaceStorageSlots} WHERE workspace_id = ?`,
      [id]
    );

    await tx.execute(
      `INSERT INTO ${cloudTables.workspaceStorageValues} (id, storage_id, workspace_id, key, value, created_at, updated_at)
       SELECT id, storage_id, workspace_id, key, value, created_at, updated_at
       FROM ${localTables.workspaceStorageValues} WHERE workspace_id = ?`,
      [id]
    );

    await tx.execute(
      `DELETE FROM ${localTables.workspaceStorageValues} WHERE workspace_id = ?`,
      [id]
    );
    await tx.execute(
      `DELETE FROM ${localTables.workspaceStorageSlots} WHERE workspace_id = ?`,
      [id]
    );
    await tx.execute(
      `DELETE FROM ${localTables.yjsDocumentUpdates} WHERE workspace_id = ?`,
      [id]
    );
    await tx.execute(
      `DELETE FROM ${localTables.yjsDocuments} WHERE workspace_id = ?`,
      [id]
    );
    await tx.execute(
      `DELETE FROM ${localTables.workspaceResources} WHERE workspace_id = ?`,
      [id]
    );
    await tx.execute(
      `DELETE FROM ${localTables.workspaceExtensions} WHERE workspace_id = ?`,
      [id]
    );
    await tx.execute(`DELETE FROM ${localTables.workspaces} WHERE id = ?`, [
      id,
    ]);
  });

  return true;
}

export function createWorkspacesService(db: DatabaseOrTx) {
  const create = (params: CreateWorkspaceSchema) =>
    createWorkspace({
      db,
      ...params,
    });

  const get = ({ id }: { id: string }) => getWorkspace({ db, id });

  const getAll = () => getAllWorkspaces({ db });

  const remove = ({ id }: { id: string }) =>
    removeWorkspace({
      db,
      id,
    });

  const rename = ({
    id,
    name,
    slug,
  }: {
    id: string;
    name: string;
    slug: string;
  }) =>
    renameWorkspace({
      db,
      id,
      name,
      slug,
    });

  const migrateToShared = ({ id }: { id: string }) =>
    migrateLocalWorkspaceToShared({ db, id });

  return { create, get, getAll, remove, rename, migrateToShared };
}
