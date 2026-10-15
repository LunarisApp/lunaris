import { recordActivity } from "../activity/services";
import { type AdditionalOptions, useQuery } from "@powersync/react";
import { useMemo } from "react";
import { type DatabaseOrTx, ensureTx } from "../../core/utils";
import { buildUnionAllQuery, resolveWorkspaceScopedTables } from "../workspace-storage";
import { resolveWorkspaceVisibility } from "../workspaces/services";
import {
  LOCAL_WORKSPACE_EXTENSIONS_TABLE,
  WORKSPACE_EXTENSIONS_TABLE,
  type WorkspaceExtensionEntity,
} from "./table";

const WORKSPACE_EXTENSIONS_UNION = buildUnionAllQuery(
  `SELECT * FROM ${WORKSPACE_EXTENSIONS_TABLE}`,
  `SELECT * FROM ${LOCAL_WORKSPACE_EXTENSIONS_TABLE}`,
);

type WorkspaceExtensionState = Omit<WorkspaceExtensionEntity, "workspace_id" | "created_at" | "updated_at">;

const workspaceExtensionId = (workspaceId: string, extensionId: string) =>
  `workspace-extension:${workspaceId}:${extensionId}`;

export interface WorkspaceExtensionRelease {
  descriptor: {
    bytes: number;
    sha256: string;
    url: string;
  } | null;
  registryId: string;
  version: string;
}

export const DEFAULT_EXCALIDRAW_EXTENSION = {
  descriptor: null,
  registryId: "lunaris-official",
  version: "0.0.1",
} as const satisfies WorkspaceExtensionRelease;

export interface WorkspaceExtensionInstallation {
  descriptorBytes: number | null;
  descriptorSha256: string | null;
  descriptorUrl: string | null;
  enabled: boolean;
  extensionId: string;
  registryId: string;
  version: string;
}

interface WorkspaceExtensionsReader {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export function getWorkspaceExtensions(
  db: WorkspaceExtensionsReader,
  workspaceId: string,
) {
  return db.getAll<WorkspaceExtensionEntity>(
    `SELECT * FROM (${WORKSPACE_EXTENSIONS_UNION}) workspace_extensions
     WHERE workspace_id = ? ORDER BY extension_id ASC`,
    [workspaceId],
  );
}

export function useWorkspaceExtensionsQuery(
  workspaceId: string,
  options?: AdditionalOptions,
) {
  return useQuery<WorkspaceExtensionEntity>(
    `SELECT * FROM (${WORKSPACE_EXTENSIONS_UNION}) workspace_extensions
     WHERE workspace_id = ? ORDER BY extension_id ASC`,
    [workspaceId],
    options,
  );
}

export function toWorkspaceExtensionInstallation(
  row: WorkspaceExtensionEntity,
): WorkspaceExtensionInstallation | null {
  if (!row.extension_id || !row.registry_id || !row.version) return null;
  return {
    descriptorBytes: row.descriptor_bytes ?? null,
    descriptorSha256: row.descriptor_sha256 ?? null,
    descriptorUrl: row.descriptor_url ?? null,
    enabled: Boolean(row.enabled),
    extensionId: row.extension_id,
    registryId: row.registry_id,
    version: row.version,
  };
}

export function useWorkspaceExtensionInstallationsQuery(
  workspaceId: string,
  options?: AdditionalOptions,
) {
  const query = useWorkspaceExtensionsQuery(workspaceId, options);
  const data = useMemo(
    () =>
      (query.data ?? []).flatMap((row) => {
        const installation = toWorkspaceExtensionInstallation(row);
        return installation ? [installation] : [];
      }),
    [query.data],
  );
  return { ...query, data };
}

export function resolveEnabledWorkspaceExtensionIds(
  rows: readonly Pick<WorkspaceExtensionEntity, "enabled" | "extension_id">[],
  defaults: readonly string[],
) {
  if (rows.length === 0) return new Set(defaults);
  return new Set(
    rows
      .filter((row) => Boolean(row.enabled))
      .map((row) => row.extension_id)
      .filter((extensionId): extensionId is string => Boolean(extensionId)),
  );
}

async function insertWorkspaceExtension(params: {
  db: DatabaseOrTx;
  enabled: boolean;
  extensionId: string;
  workspaceId: string;
  release?: WorkspaceExtensionRelease;
  table: string;
}) {
  const now = new Date().toISOString();
  await params.db.execute(
    `INSERT INTO ${params.table}
      (id, workspace_id, extension_id, enabled, registry_id, version,
       descriptor_url, descriptor_bytes, descriptor_sha256, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workspaceExtensionId(params.workspaceId, params.extensionId),
      params.workspaceId,
      params.extensionId,
      params.enabled ? 1 : 0,
      params.release?.registryId ?? null,
      params.release?.version ?? null,
      params.release?.descriptor?.url ?? null,
      params.release?.descriptor?.bytes ?? null,
      params.release?.descriptor?.sha256 ?? null,
      now,
      now,
    ],
  );
  await recordActivity(params.db, { workspaceId: params.workspaceId }, now);
}

async function installWorkspaceExtension(params: {
  db: DatabaseOrTx;
  defaultExtensionIds: readonly string[];
  extensionId: string;
  knownExtensionIds: readonly string[];
  workspaceId: string;
  release: WorkspaceExtensionRelease;
}) {
  await ensureTx(params.db, async (tx) => {
    const visibility = await resolveWorkspaceVisibility(tx, params.workspaceId);
    const table = resolveWorkspaceScopedTables(visibility).workspaceExtensions;
    const existing = await tx.getAll<WorkspaceExtensionState>(
      `SELECT * FROM ${table} WHERE workspace_id = ?`,
      [params.workspaceId],
    );
    const existingByExtensionId = new Map(
      existing.map((extension) => [extension.extension_id, extension]),
    );

    if (existing.length === 0) {
      const defaults = new Set(params.defaultExtensionIds);
      for (const extensionId of new Set([
        ...params.knownExtensionIds,
        ...params.defaultExtensionIds,
      ])) {
        await insertWorkspaceExtension({
          db: tx,
          enabled: defaults.has(extensionId),
          extensionId,
          workspaceId: params.workspaceId,
          table,
        });
        existingByExtensionId.set(extensionId, {
          extension_id: extensionId,
          id: workspaceExtensionId(params.workspaceId, extensionId),
          enabled: defaults.has(extensionId) ? 1 : 0,
          registry_id: null,
          version: null,
          descriptor_url: null,
          descriptor_bytes: null,
          descriptor_sha256: null,
        });
      }
    }

    const current = existingByExtensionId.get(params.extensionId);
    const release = params.release;
    if (current) {
      if (current.enabled === 1 && current.registry_id === release.registryId &&
          current.version === release.version &&
          current.descriptor_url === (release.descriptor?.url ?? null) &&
          current.descriptor_bytes === (release.descriptor?.bytes ?? null) &&
          current.descriptor_sha256 === (release.descriptor?.sha256 ?? null)) return;
      const now = new Date().toISOString();
      await tx.execute(
        `UPDATE ${table}
         SET enabled = 1, registry_id = ?, version = ?, descriptor_url = ?,
             descriptor_bytes = ?, descriptor_sha256 = ?, updated_at = ?
         WHERE id = ?`,
        [
          release.registryId,
          release.version,
          release.descriptor?.url ?? null,
          release.descriptor?.bytes ?? null,
          release.descriptor?.sha256 ?? null,
          now,
          current.id,
        ],
      );
      await recordActivity(tx, { workspaceId: params.workspaceId }, now);
      return;
    }

    await insertWorkspaceExtension({
      db: tx,
      enabled: true,
      extensionId: params.extensionId,
      workspaceId: params.workspaceId,
      release,
      table,
    });
  });
}

async function uninstallWorkspaceExtension(params: {
  db: DatabaseOrTx;
  extensionId: string;
  workspaceId: string;
}) {
  await ensureTx(params.db, async (tx) => {
    const visibility = await resolveWorkspaceVisibility(tx, params.workspaceId);
    const table = resolveWorkspaceScopedTables(visibility).workspaceExtensions;
    const existing = await tx.getOptional<{ id: string }>(
      `SELECT id FROM ${table} WHERE workspace_id = ? AND extension_id = ? AND registry_id IS NOT NULL`,
      [params.workspaceId, params.extensionId],
    );
    if (!existing) return;
    await recordActivity(tx, { workspaceId: params.workspaceId });
    await tx.execute(
      `DELETE FROM ${table}
       WHERE workspace_id = ? AND extension_id = ? AND registry_id IS NOT NULL`,
      [params.workspaceId, params.extensionId],
    );
  });
}

async function restoreWorkspaceExtension(params: {
  db: DatabaseOrTx;
  installation: WorkspaceExtensionInstallation;
  workspaceId: string;
}) {
  const { installation } = params;
  await ensureTx(params.db, async (tx) => {
    await installWorkspaceExtension({
      db: tx,
      defaultExtensionIds: [],
      extensionId: installation.extensionId,
      knownExtensionIds: [installation.extensionId],
      workspaceId: params.workspaceId,
      release: {
        descriptor:
          installation.descriptorBytes !== null &&
          installation.descriptorSha256 &&
          installation.descriptorUrl
            ? {
                bytes: installation.descriptorBytes,
                sha256: installation.descriptorSha256,
                url: installation.descriptorUrl,
              }
            : null,
        registryId: installation.registryId,
        version: installation.version,
      },
    });
    if (!installation.enabled) {
      await setWorkspaceExtension({
        db: tx,
        defaultExtensionIds: [],
        enabled: false,
        extensionId: installation.extensionId,
        knownExtensionIds: [installation.extensionId],
        workspaceId: params.workspaceId,
      });
    }
  });
}

async function updateWorkspaceExtension(params: {
  db: DatabaseOrTx;
  enabled: boolean;
  id: string;
  table: string;
  workspaceId: string;
}) {
  const now = new Date().toISOString();
  await params.db.execute(
    `UPDATE ${params.table} SET enabled = ?, updated_at = ? WHERE id = ?`,
    [params.enabled ? 1 : 0, now, params.id],
  );
  await recordActivity(params.db, { workspaceId: params.workspaceId }, now);
}

async function setWorkspaceExtension(params: {
  db: DatabaseOrTx;
  defaultExtensionIds: readonly string[];
  enabled: boolean;
  extensionId: string;
  knownExtensionIds: readonly string[];
  workspaceId: string;
}) {
  await ensureTx(params.db, async (tx) => {
    const visibility = await resolveWorkspaceVisibility(tx, params.workspaceId);
    const table = resolveWorkspaceScopedTables(visibility).workspaceExtensions;
    const existing = await tx.getAll<WorkspaceExtensionState>(
      `SELECT * FROM ${table} WHERE workspace_id = ?`,
      [params.workspaceId],
    );

    if (existing.length > 0) {
      const current = existing.find(
        (extension) => extension.extension_id === params.extensionId,
      );
      if (current) {
        if (current.enabled === (params.enabled ? 1 : 0)) return;
        await updateWorkspaceExtension({
          db: tx,
          enabled: params.enabled,
          id: current.id,
          table,
          workspaceId: params.workspaceId,
        });
      } else {
        await insertWorkspaceExtension({ ...params, db: tx, table });
      }
      return;
    }

    const defaults = new Set(params.defaultExtensionIds);
    const extensionIds = new Set([
      ...params.knownExtensionIds,
      ...defaults,
      params.extensionId,
    ]);
    for (const extensionId of extensionIds) {
      await insertWorkspaceExtension({
        db: tx,
        enabled:
          extensionId === params.extensionId
            ? params.enabled
            : defaults.has(extensionId),
        extensionId,
        workspaceId: params.workspaceId,
        table,
      });
    }
  });
}

export async function replaceWorkspaceExtensions(params: {
  db: DatabaseOrTx;
  enabledExtensionIds: readonly string[];
  knownExtensionIds?: readonly string[];
  workspaceId: string;
}) {
  const enabledExtensionIds = new Set(params.enabledExtensionIds);
  const extensionIds = new Set([
    ...(params.knownExtensionIds ?? []),
    ...enabledExtensionIds,
  ]);
  await ensureTx(params.db, async (tx) => {
    const visibility = await resolveWorkspaceVisibility(tx, params.workspaceId);
    const table = resolveWorkspaceScopedTables(visibility).workspaceExtensions;
    const existing = await tx.getAll<WorkspaceExtensionState>(
      `SELECT * FROM ${table} WHERE workspace_id = ?`, [params.workspaceId],
    );
    if (existing.length === extensionIds.size && existing.every((row) =>
      row.extension_id !== null && extensionIds.has(row.extension_id) &&
      row.enabled === (enabledExtensionIds.has(row.extension_id) ? 1 : 0) &&
      row.registry_id === null && row.version === null && row.descriptor_url === null &&
      row.descriptor_bytes === null && row.descriptor_sha256 === null
    )) return;
    await recordActivity(tx, { workspaceId: params.workspaceId });
    await tx.execute(`DELETE FROM ${table} WHERE workspace_id = ?`, [params.workspaceId]);
    for (const extensionId of extensionIds) {
      await insertWorkspaceExtension({
        db: tx,
        enabled: enabledExtensionIds.has(extensionId),
        extensionId,
        workspaceId: params.workspaceId,
        table,
      });
    }
  });
}

export function createWorkspaceExtensionsService(
  db: DatabaseOrTx,
  workspaceId: string,
) {
  return {
    replace: (
      enabledExtensionIds: readonly string[],
      knownExtensionIds?: readonly string[],
    ) =>
      replaceWorkspaceExtensions({
        db,
        enabledExtensionIds,
        knownExtensionIds,
        workspaceId,
      }),
    restore: (installation: WorkspaceExtensionInstallation) =>
      restoreWorkspaceExtension({ db, installation, workspaceId }),
    setEnabled: (
      extensionId: string,
      enabled: boolean,
      initialState: {
        defaultExtensionIds: readonly string[];
        knownExtensionIds: readonly string[];
      },
    ) =>
      setWorkspaceExtension({
        db,
        enabled,
        extensionId,
        workspaceId,
        ...initialState,
      }),
    install: (
      extensionId: string,
      release: WorkspaceExtensionRelease,
      initialState: {
        defaultExtensionIds: readonly string[];
        knownExtensionIds: readonly string[];
      },
    ) =>
      installWorkspaceExtension({
        db,
        extensionId,
        workspaceId,
        release,
        ...initialState,
      }),
    uninstall: (extensionId: string) =>
      uninstallWorkspaceExtension({ db, extensionId, workspaceId }),
  };
}
