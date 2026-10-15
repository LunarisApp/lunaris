import {
  type ContentRequestOptions,
  type ContentSnapshot,
  findBuiltInPluginMcpProcedure,
  type LunarisControlClient,
  type Page,
  type PaginationInput,
  type PendingAwareControlClient,
  type PendingContentChanges,
  type PendingContentTable,
  type Workspace,
  type WorkspaceResource,
  type WorkspaceResourceSearchInput,
  type WorkspaceResourceSearchResult,
  type Organization,
} from "@repo/agent-contracts";
import { LunarisApiError } from "./agent-client/cloud-client";

const PAGE_SIZE = 100;

type PageFetcher<T> = (
  input: PaginationInput,
  options?: ContentRequestOptions,
) => Promise<Page<T>>;

export function createHybridControlClient(
  local: PendingAwareControlClient,
  cloud: LunarisControlClient,
): LunarisControlClient {
  const workspaceSource = async (
    organizationId: string,
    workspaceId: string,
  ): Promise<{ complete: boolean; workspace?: Workspace }> => {
    try {
      const workspace = await local.getWorkspace(
        organizationId,
        workspaceId,
        { consistency: "cached" },
      );
      return {
        complete:
          workspace.visibility === "local" ||
          workspace.provenance?.syncState === "current",
        workspace,
      };
    } catch (error) {
      if (isExpectedLocalMiss(error)) return { complete: false };
      throw error;
    }
  };

  const workspaceRead = async <T>(
    organizationId: string,
    workspaceId: string,
    options: ContentRequestOptions | undefined,
    localRead: (options: ContentRequestOptions) => Promise<T>,
    cloudRead: (options: ContentRequestOptions) => Promise<T>,
    behavior: {
      storageId?: string;
      pendingRefs?: PendingReference[];
      pendingRefsForValue?: (value: T) => PendingReference[];
      trustUntrackedCache?: boolean;
    } = {},
  ) => {
    if (options?.consistency === "cached") {
      return localRead(options);
    }
    const source = await workspaceSource(organizationId, workspaceId);
    if (source.workspace?.visibility === "local") {
      return localRead({ ...options, consistency: "cached" });
    }
    let cached: T | undefined;
    try {
      cached = await localRead({ ...options, consistency: "cached" });
    } catch (error) {
      if (!isExpectedLocalMiss(error)) throw error;
    }
    const changes = await pendingChanges();
    const overlay = pendingOverlay(changes);
    const references = [
      ...(behavior.pendingRefs ?? []),
      ...(cached !== undefined
        ? (behavior.pendingRefsForValue?.(cached) ?? [])
        : []),
    ];
    const pendingDelete = references.some(({ id, table }) =>
      overlay.deletes.get(table)?.has(id)
    );
    if (pendingDelete) throw pendingDeleteError(references);
    const pendingUpsert = references.some(({ id, table }) =>
      overlay.upserts.get(table)?.has(id)
    );
    const pendingStorage =
      behavior.storageId !== undefined &&
      changes?.storageIds.includes(behavior.storageId);
    if (
      cached !== undefined &&
      (behavior.trustUntrackedCache ||
        pendingUpsert ||
        pendingStorage ||
        (source.complete && resourceIsCurrent(cached)))
    ) {
      return cached;
    }
    return raceRead(
      localRead({ ...options, consistency: "confirmed" }),
      cloudRead(options ?? {}),
      cached,
      options,
    );
  };

  const cloudRequired = async <T>(run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      if (isConnectivityError(error)) throw cloudUnavailable();
      throw exposeCloudError(error);
    }
  };
  const pendingChanges = async () => local.pendingContentChanges?.();

  return {
    createWorkspace: local.createWorkspace.bind(local),
    createWorkspaceResource: local.createWorkspaceResource.bind(local),
    deleteWorkspace: local.deleteWorkspace.bind(local),
    deleteWorkspaceResource: local.deleteWorkspaceResource.bind(local),
    executePluginOperation(
      organizationId,
      workspaceId,
      pluginId,
      operation,
      input,
      options,
    ) {
      const definition = findBuiltInPluginMcpProcedure(pluginId, operation);
      if (!definition) {
        return Promise.reject(
          new TypeError(
            `Unknown built-in extension operation: ${pluginId}:${operation}`,
          ),
        );
      }
      const client =
        definition.execution.offlineAvailability === "supported"
          ? local
          : cloud;
      return client.executePluginOperation(
        organizationId,
        workspaceId,
        pluginId,
        operation,
        input,
        options,
      );
    },

    async getYjsStorageJson(organizationId, workspaceId, storageId, options) {
      return workspaceRead(
        organizationId,
        workspaceId,
        options,
        (read) =>
          local.getYjsStorageJson(organizationId, workspaceId, storageId, read),
        (read) =>
          cloud.getYjsStorageJson(organizationId, workspaceId, storageId, read),
        {
          storageId,
          pendingRefs: [{ id: workspaceId, table: "workspaces" }],
        },
      );
    },

    async getYjsStorageState(
      organizationId,
      workspaceId,
      storageId,
      stateVectorB64,
      options,
    ) {
      return workspaceRead(
        organizationId,
        workspaceId,
        options,
        (read) =>
          local.getYjsStorageState(
            organizationId,
            workspaceId,
            storageId,
            stateVectorB64,
            read,
          ),
        (read) =>
          cloud.getYjsStorageState(
            organizationId,
            workspaceId,
            storageId,
            stateVectorB64,
            read,
          ),
        {
          storageId,
          pendingRefs: [{ id: workspaceId, table: "workspaces" }],
        },
      );
    },

    async getFileDownloadUrl(
      organizationId,
      workspaceId,
      storageId,
      options,
    ) {
      return workspaceRead(
        organizationId,
        workspaceId,
        options,
        (read) =>
          local.getFileDownloadUrl(
            organizationId,
            workspaceId,
            storageId,
            read,
          ),
        (read) =>
          cloud.getFileDownloadUrl(
            organizationId,
            workspaceId,
            storageId,
            read,
          ),
        {
          pendingRefs: [{ id: workspaceId, table: "workspaces" }],
          trustUntrackedCache: true,
        },
      );
    },

    async getWorkspace(organizationId, workspaceId, options) {
      if (options?.consistency === "cached") {
        return local.getWorkspace(organizationId, workspaceId, options);
      }
      const source = await workspaceSource(organizationId, workspaceId);
      const overlay = pendingOverlay(await pendingChanges());
      if (overlay.deletes.get("workspaces")?.has(workspaceId)) {
        throw pendingDeleteError([{ id: workspaceId, table: "workspaces" }]);
      }
      if (
        source.workspace &&
        (source.workspace.visibility === "local" ||
          source.complete ||
          overlay.upserts.get("workspaces")?.has(workspaceId))
      ) {
        return source.workspace;
      }
      return raceRead(
        local.getWorkspace(organizationId, workspaceId, {
          ...options,
          consistency: "confirmed",
        }),
        cloud.getWorkspace(organizationId, workspaceId, options),
        source.workspace,
        options,
      );
    },

    async listKeyValueStorage(
      organizationId,
      workspaceId,
      storageId,
      options,
    ) {
      return workspaceRead(
        organizationId,
        workspaceId,
        options,
        (read) =>
          local.listKeyValueStorage(
            organizationId,
            workspaceId,
            storageId,
            read,
          ),
        (read) =>
          cloud.listKeyValueStorage(
            organizationId,
            workspaceId,
            storageId,
            read,
          ),
        {
          pendingRefs: [
            { id: workspaceId, table: "workspaces" },
          ],
          storageId,
        },
      );
    },

    async getWorkspaceResource(organizationId, workspaceId, resourceId, options) {
      return workspaceRead(
        organizationId,
        workspaceId,
        options,
        (read) =>
          local.getWorkspaceResource(organizationId, workspaceId, resourceId, read),
        (read) =>
          cloud.getWorkspaceResource(organizationId, workspaceId, resourceId, read),
        {
          pendingRefs: [
            { id: workspaceId, table: "workspaces" },
            { id: resourceId, table: "workspace_resources" },
          ],
        },
      );
    },

    async getOrganization(organizationId, options) {
      if (options?.consistency === "cached") {
        return local.getOrganization(organizationId, options);
      }
      let cached: Organization | undefined;
      try {
        cached = await local.getOrganization(organizationId, {
          ...options,
          consistency: "cached",
        });
        if (resourceIsCurrent(cached)) return cached;
      } catch (error) {
        if (!isExpectedLocalMiss(error)) throw error;
      }
      try {
        return await cloud.getOrganization(organizationId, options);
      } catch (error) {
        if (!isConnectivityError(error)) throw exposeCloudError(error);
        if (options?.consistency === "confirmed") throw incompleteSync();
        if (cached) return cached;
        throw incompleteSync();
      }
    },

    inviteOrganizationMember(organizationId, input, options) {
      return cloudRequired(() =>
        cloud.inviteOrganizationMember(organizationId, input, options),
      );
    },

    async listWorkspaceResources(organizationId, workspaceId, input = {}, options) {
      const source = await workspaceSource(organizationId, workspaceId);
      if (source.workspace?.visibility === "local") {
        return local.listWorkspaceResources(organizationId, workspaceId, input, options);
      }
      return hybridPage({
        cloud: (page, read) =>
          cloud.listWorkspaceResources(organizationId, workspaceId, {
            ...input,
            ...page,
          }, read),
        compare: compareWorkspaceResources,
        compareCursor: compareWorkspaceResourceCursor,
        cursorScope: JSON.stringify([
          "resources",
          organizationId,
          workspaceId,
          input.name ?? null,
          input.parentId ?? null,
          input.resourceTypeId ?? null,
        ]),
        input,
        key: (value) => value.id,
        local: (page, read) =>
          local.listWorkspaceResources(organizationId, workspaceId, {
            ...input,
            ...page,
          }, read),
        options,
        pending: pendingChanges,
        pendingRefs: (value) => [
          { id: workspaceId, table: "workspaces" },
          { id: value.id, table: "workspace_resources" },
        ],
        toCursor: workspaceResourceCursor,
      });
    },

    listWorkspaces(organizationId, input = {}, options) {
      return hybridPage({
        cloud: (page, read) => cloud.listWorkspaces(organizationId, page, read),
        compare: compareWorkspaces,
        compareCursor: compareWorkspaceCursor,
        cursorScope: JSON.stringify(["workspaces", organizationId]),
        input,
        key: (value) => value.id,
        local: (page, read) => local.listWorkspaces(organizationId, page, read),
        options,
        pending: pendingChanges,
        pendingRefs: (value) => [{ id: value.id, table: "workspaces" }],
        toCursor: workspaceCursor,
      });
    },

    listOrganizationMembers(organizationId, input = {}, options) {
      return cloudRequired(() =>
        cloud.listOrganizationMembers(organizationId, input, options),
      );
    },

    listOrganizations(input = {}, options) {
      return hybridPage({
        cloud: (page, read) => cloud.listOrganizations(page, read),
        compare: compareOrganizations,
        compareCursor: compareOrganizationCursor,
        cursorScope: JSON.stringify(["organizations"]),
        input,
        key: (value) => value.id,
        local: (page, read) => local.listOrganizations(page, read),
        options,
        toCursor: organizationCursor,
      });
    },

    previewDeleteWorkspace: local.previewDeleteWorkspace.bind(local),
    previewDeleteWorkspaceResource:
      local.previewDeleteWorkspaceResource.bind(local),

    previewRemoveOrganizationMember(organizationId, memberId, options) {
      return cloudRequired(() =>
        cloud.previewRemoveOrganizationMember(organizationId, memberId, options),
      );
    },

    removeOrganizationMember(
      organizationId,
      memberId,
      previewToken,
      options,
    ) {
      return cloudRequired(() =>
        cloud.removeOrganizationMember(
          organizationId,
          memberId,
          previewToken,
          options,
        ),
      );
    },

    searchResources(organizationId, input, options) {
      return hybridPage({
        cloud: (page, read) =>
          cloud.searchResources(organizationId, { ...input, ...page }, read),
        compare: compareSearchResults(input),
        compareCursor: compareSearchCursor(input),
        cursorScope: JSON.stringify([
          "search",
          organizationId,
          input.search,
          input.workspaceId ?? null,
        ]),
        input,
        key: (value) => value.id,
        local: (page, read) =>
          local.searchResources(organizationId, { ...input, ...page }, read),
        options,
        pending: pendingChanges,
        pendingRefs: (value) => [
          { id: value.workspaceId, table: "workspaces" },
          { id: value.id, table: "workspace_resources" },
        ],
        toCursor: searchCursor(input),
      });
    },

    updateWorkspace: local.updateWorkspace.bind(local),
    updateWorkspaceResource: local.updateWorkspaceResource.bind(local),

    updateOrganization(organizationId, input, options) {
      return cloudRequired(() =>
        cloud.updateOrganization(organizationId, input, options),
      );
    },
  };
}

async function hybridPage<T>({
  cloud,
  compare,
  compareCursor,
  cursorScope,
  input,
  key,
  local,
  options,
  pending,
  pendingRefs,
  toCursor,
}: {
  cloud: PageFetcher<T>;
  compare: (left: T, right: T) => number;
  compareCursor: (value: T, cursor: CursorKey) => number;
  cursorScope: string;
  input: PaginationInput;
  key: (value: T) => string;
  local: PageFetcher<T>;
  options?: ContentRequestOptions;
  pending?: () => Promise<PendingContentChanges | undefined>;
  pendingRefs?: (value: T) => PendingReference[];
  toCursor: (value: T) => CursorKey;
}): Promise<Page<T>> {
  const after = decodeCursor(input.cursor, cursorScope);
  const limit = input.limit ?? 50;
  const target = limit + 1;
  const finish = (page: CollectedPage<T>) =>
    slicePage(
      page.items,
      limit,
      page.snapshot,
      page.hasMore,
      cursorScope,
      toCursor,
    );
  const include = after
    ? (value: T) => compareCursor(value, after) > 0
    : undefined;
  let localPage: CollectedPage<T>;
  try {
    localPage = await collectPages(
      local,
      target,
      { consistency: "cached", signal: options?.signal },
      include,
    );
  } catch (error) {
    if (!isExpectedLocalMiss(error)) throw error;
    localPage = {
      hasMore: false,
      items: [],
      snapshot: incompleteSnapshot(),
    };
  }
  if (
    options?.consistency === "cached" ||
    isComplete(localPage.snapshot)
  ) {
    return finish(localPage);
  }
  const changes = await pending?.();
  if (changes && !changes.complete && options?.consistency === "confirmed") {
    throw incompleteSync();
  }
  const overlay = pendingOverlay(changes);
  const includeCloud = (value: T) =>
    (include?.(value) ?? true) &&
    !isPendingDelete(value, overlay, pendingRefs);

  const result = await raceRead(
    collectPages(
      local,
      target,
      {
        consistency: "confirmed",
        signal: options?.signal,
      },
      include,
    ).then((page) => {
      if (!isComplete(page.snapshot)) throw incompleteSync();
      return { kind: "local" as const, page };
    }),
    collectPages(cloud, target, options, includeCloud).then((page) => ({
      kind: "cloud" as const,
      page,
    })),
    { kind: "local" as const, page: localPage },
    options,
  );
  if (result.kind === "local") {
    return finish(result.page);
  }
  const cloudPage = result.page;
  return finish({
    hasMore: localPage.hasMore || cloudPage.hasMore,
    items: mergePageItems(
      localPage.items,
      cloudPage.items,
      compare,
      key,
      overlay,
      pendingRefs,
    ),
    snapshot:
      changes && !changes.complete
        ? incompleteSnapshot("stale")
        : completeSnapshot(),
  });
}

interface PendingReference {
  id: string;
  table: PendingContentTable;
}

interface PendingOverlay {
  deletes: Map<PendingContentTable, Set<string>>;
  upserts: Map<PendingContentTable, Set<string>>;
}

function pendingOverlay(
  changes: PendingContentChanges | undefined,
): PendingOverlay {
  const collect = (
    source: PendingContentChanges["deletes"],
  ): Map<PendingContentTable, Set<string>> =>
    new Map(
      Object.entries(source).map(([table, ids]) => [
        table as PendingContentTable,
        new Set(ids),
      ]),
    );
  return {
    deletes: collect(changes?.deletes ?? {}),
    upserts: collect(changes?.upserts ?? {}),
  };
}

function hasPendingReference<T>(
  value: T,
  overlay: Map<PendingContentTable, Set<string>>,
  references?: (value: T) => PendingReference[],
) {
  return (
    references?.(value).some(({ id, table }) => overlay.get(table)?.has(id)) ??
    false
  );
}

function isPendingDelete<T>(
  value: T,
  overlay: PendingOverlay,
  references?: (value: T) => PendingReference[],
) {
  return hasPendingReference(value, overlay.deletes, references);
}

function isPendingUpsert<T>(
  value: T,
  overlay: PendingOverlay,
  references?: (value: T) => PendingReference[],
) {
  return hasPendingReference(value, overlay.upserts, references);
}

function mergePageItems<T>(
  local: T[],
  cloud: T[],
  compare: (left: T, right: T) => number,
  key: (value: T) => string,
  overlay: PendingOverlay,
  references?: (value: T) => PendingReference[],
) {
  const merged = new Map<string, T>();
  for (const value of cloud) {
    if (!isPendingDelete(value, overlay, references)) {
      merged.set(key(value), value);
    }
  }
  for (const value of local) {
    const id = key(value);
    if (
      !isPendingDelete(value, overlay, references) &&
      (!merged.has(id) ||
        isPendingUpsert(value, overlay, references) ||
        preferLocalValue(value))
    ) {
      merged.set(id, value);
    }
  }
  return [...merged.values()].sort(compare);
}

interface CollectedPage<T> {
  hasMore: boolean;
  items: T[];
  snapshot?: ContentSnapshot;
}

async function collectPages<T>(
  fetchPage: PageFetcher<T>,
  target: number,
  options?: ContentRequestOptions,
  include?: (value: T) => boolean,
): Promise<CollectedPage<T>> {
  const items: T[] = [];
  let cursor: string | undefined;
  let snapshot: ContentSnapshot | undefined;
  do {
    const page = await fetchPage(
      { cursor, limit: Math.min(PAGE_SIZE, Math.max(1, target - items.length)) },
      options,
    );
    items.push(...(include ? page.items.filter(include) : page.items));
    snapshot = page.snapshot ?? snapshot;
    cursor = page.nextCursor ?? undefined;
  } while (cursor && items.length < target);
  return { hasMore: Boolean(cursor), items, snapshot };
}

function slicePage<T>(
  items: T[],
  limit: number,
  snapshot?: ContentSnapshot,
  hasMore = false,
  cursorScope = "",
  toCursor: (value: T) => CursorKey = () => [],
): Page<T> {
  const values = items.slice(0, limit);
  const last = values.at(-1);
  return {
    items: values,
    nextCursor:
      last && (values.length < items.length || hasMore)
        ? encodeCursor(toCursor(last), cursorScope)
        : null,
    ...(snapshot ? { snapshot } : {}),
  };
}

type CursorKey = (number | string | null)[];

function encodeCursor(after: CursorKey, scope: string) {
  return btoa(JSON.stringify({ after, scope, version: 2 }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeCursor(cursor: string | undefined, scope: string) {
  if (!cursor) return;
  try {
    const normalized = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const value = JSON.parse(atob(normalized)) as {
      after?: unknown;
      scope?: unknown;
      version?: unknown;
    };
    if (
      value.version !== 2 ||
      value.scope !== scope ||
      !isCursorKey(value.after)
    ) {
      throw new Error("Invalid cursor");
    }
    return value.after;
  } catch {
    throw exposedError(400, "INVALID_CURSOR", "Invalid Desktop cursor");
  }
}

function isCursorKey(value: unknown): value is CursorKey {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item === null ||
        typeof item === "string" ||
        (typeof item === "number" && Number.isFinite(item)),
    )
  );
}

function isComplete(snapshot?: ContentSnapshot) {
  return (
    snapshot?.completeness === "complete" &&
    snapshot.syncState === "current"
  );
}

function resourceIsCurrent(value: unknown) {
  if (!value || typeof value !== "object" || !("provenance" in value)) {
    return false;
  }
  const provenance = value.provenance;
  return (
    !provenance ||
    (typeof provenance === "object" &&
      provenance !== null &&
      "syncState" in provenance &&
      provenance.syncState === "current")
  );
}

function preferLocalValue(value: unknown) {
  if (!value || typeof value !== "object") return false;
  if ("visibility" in value && value.visibility === "local") return true;
  if (!("provenance" in value)) return false;
  const provenance = value.provenance;
  return (
    typeof provenance === "object" &&
    provenance !== null &&
    (("source" in provenance && provenance.source === "device-local") ||
      ("syncState" in provenance && provenance.syncState === "current"))
  );
}

function completeSnapshot(): ContentSnapshot {
  return {
    completeness: "complete",
    confirmedAt: new Date().toISOString(),
    syncState: "current",
  };
}

function incompleteSnapshot(
  syncState: ContentSnapshot["syncState"] = "unknown",
): ContentSnapshot {
  return {
    completeness: "partial",
    confirmedAt: null,
    syncState,
  };
}

function compareWorkspaces(left: Workspace, right: Workspace) {
  return (
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareOrganizations(left: Organization, right: Organization) {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function organizationCursor(value: Organization): CursorKey {
  return [value.name, value.id];
}

function compareOrganizationCursor(value: Organization, cursor: CursorKey) {
  return (
    value.name.localeCompare(cursorString(cursor, 0)) ||
    value.id.localeCompare(cursorString(cursor, 1))
  );
}

function workspaceCursor(value: Workspace): CursorKey {
  return [value.updatedAt, value.id];
}

function compareWorkspaceCursor(value: Workspace, cursor: CursorKey) {
  return (
    cursorString(cursor, 0).localeCompare(value.updatedAt) ||
    value.id.localeCompare(cursorString(cursor, 1))
  );
}

function compareWorkspaceResources(left: WorkspaceResource, right: WorkspaceResource) {
  return (
    left.position - right.position ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function workspaceResourceCursor(value: WorkspaceResource): CursorKey {
  return [value.position, value.createdAt, value.id];
}

function compareWorkspaceResourceCursor(
  value: WorkspaceResource,
  cursor: CursorKey,
) {
  return (
    value.position - cursorNumber(cursor, 0) ||
    value.createdAt.localeCompare(cursorString(cursor, 1)) ||
    value.id.localeCompare(cursorString(cursor, 2))
  );
}

function compareSearchResults(input: WorkspaceResourceSearchInput) {
  return (left: WorkspaceResourceSearchResult, right: WorkspaceResourceSearchResult) =>
    searchRank(left, input) - searchRank(right, input) ||
    left.name.toLocaleLowerCase().localeCompare(right.name.toLocaleLowerCase()) ||
    left.workspaceName
      .toLocaleLowerCase()
      .localeCompare(right.workspaceName.toLocaleLowerCase()) ||
    left.id.localeCompare(right.id);
}

function searchCursor(input: WorkspaceResourceSearchInput) {
  return (value: WorkspaceResourceSearchResult): CursorKey => [
    searchRank(value, input),
    value.name.toLocaleLowerCase(),
    value.workspaceName.toLocaleLowerCase(),
    value.id,
  ];
}

function compareSearchCursor(input: WorkspaceResourceSearchInput) {
  return (value: WorkspaceResourceSearchResult, cursor: CursorKey) =>
    searchRank(value, input) - cursorNumber(cursor, 0) ||
    value.name.toLocaleLowerCase().localeCompare(cursorString(cursor, 1)) ||
    value.workspaceName
      .toLocaleLowerCase()
      .localeCompare(cursorString(cursor, 2)) ||
    value.id.localeCompare(cursorString(cursor, 3));
}

function searchRank(
  value: WorkspaceResourceSearchResult,
  input: WorkspaceResourceSearchInput,
) {
  const search = input.search.trim().toLocaleLowerCase();
  const item = value.name.toLocaleLowerCase();
  const workspace = value.workspaceName.toLocaleLowerCase();
  if (item === search || workspace === search) return 0;
  if (item.startsWith(search) || workspace.startsWith(search)) return 1;
  return 2;
}

function cursorString(cursor: CursorKey, index: number) {
  const value = cursor[index];
  if (typeof value !== "string") throw invalidCursor();
  return value;
}

function cursorNumber(cursor: CursorKey, index: number) {
  const value = cursor[index];
  if (typeof value !== "number") throw invalidCursor();
  return value;
}

function invalidCursor() {
  return exposedError(400, "INVALID_CURSOR", "Invalid Desktop cursor");
}

function pendingDeleteError(references: PendingReference[] = []) {
  const table = references.at(-1)?.table;
  if (table === "workspace_resources") {
    return exposedError(404, "RESOURCE_NOT_FOUND", "Workspace resource not found");
  }
  return exposedError(404, "WORKSPACE_NOT_FOUND", "Workspace not found");
}

function isConnectivityError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException &&
      ["AbortError", "TimeoutError"].includes(error.name)) ||
    (error instanceof LunarisApiError && error.status === 0) ||
    (errorStatus(error) === 0 && isOfflineError(error))
  );
}

async function raceRead<T>(
  local: Promise<T>,
  cloud: Promise<T>,
  cached: T | undefined,
  options?: ContentRequestOptions,
): Promise<T> {
  const localAttempt = attempt("local", local);
  const cloudAttempt = attempt("cloud", cloud);
  const first = await Promise.race([localAttempt, cloudAttempt]);
  if (first.ok) return first.value;
  if (first.source === "cloud" && !isConnectivityError(first.error)) {
    throw exposeCloudError(first.error);
  }
  const second =
    first.source === "local" ? await cloudAttempt : await localAttempt;
  if (second.ok) return second.value;
  const cloudError =
    first.source === "cloud" ? first.error : second.error;
  if (!isConnectivityError(cloudError)) {
    throw exposeCloudError(cloudError);
  }
  if (options?.consistency !== "confirmed" && cached !== undefined) {
    return cached;
  }
  throw incompleteSync();
}

function attempt<T>(source: "cloud" | "local", promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, source, value }),
    (error: unknown) => ({ error, ok: false as const, source }),
  );
}

function isExpectedLocalMiss(error: unknown) {
  const code = errorCode(error);
  return (
    code === "INCOMPLETE_SYNC" ||
    code === "WORKSPACE_NOT_FOUND" ||
    code === "ORGANIZATION_NOT_FOUND"
  );
}

function exposeCloudError(error: unknown) {
  if (error instanceof LunarisApiError) {
    return exposedError(error.status, error.code, error.message, error.details);
  }
  const status = errorStatus(error);
  if (status > 0 && error instanceof Error) {
    return exposedError(
      status,
      errorCode(error) ?? `HTTP_${status}`,
      error.message,
    );
  }
  return error;
}

function cloudUnavailable() {
  return exposedError(
    503,
    "CLOUD_UNAVAILABLE",
    "Cloud connectivity is required for this operation",
  );
}

function incompleteSync() {
  return exposedError(
    409,
    "INCOMPLETE_SYNC",
    "Required Desktop content is unavailable or incomplete",
  );
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("reason" in error && typeof error.reason === "string") {
    return error.reason;
  }
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return -1;
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  return -1;
}

function isOfflineError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "isOffline" in error &&
    error.isOffline === true
  );
}

function exposedError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return Object.assign(new Error(message), {
    code,
    ...(details === undefined ? {} : { details }),
    exposeToAgent: true,
    status,
  });
}
