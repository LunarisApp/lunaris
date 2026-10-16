/**
 * Extension runtime context — host-injected hooks extensions consume via SDK.
 *
 * Extensions should never reach into private host packages directly.
 * Instead, they use SDK hooks like `useCurrentWorkspace()` that delegate to a
 * runtime impl bound by the host at mount time.
 *
 * Lunaris app-shell binds these capabilities for the active workspace.
 */

import type { PluginResourceReadContext } from "./resource-data";
import type { PluginEntityReference } from "./entity-references";
import type { JsonObject } from "./json";
import { usePluginSdkRuntime } from "./provider";
import { usePluginPermission } from "./scope";
import type {
  ResourceCreateResult,
  ResourceStorageHandle,
  ResourceStorageHandles,
} from "./types";

export interface PluginWorkspaceSummary {
  id: string;
  name: string | null;
}

export interface PluginWorkspacesPage {
  items: PluginWorkspaceSummary[];
  nextCursor: string | null;
}

export interface PluginCurrentWorkspace {
  /** Minimal workspace summary — null while loading or if not found. */
  workspace: PluginWorkspaceSummary | null;
  /** Current workspace ID — empty string before workspace loads. */
  workspaceId: string;
}

export interface PluginApiTransport {
  /** API origin selected by the host for the current region. */
  baseUrl: string;
  /** Cookie-authenticated fetch with CSRF protection for unsafe methods. */
  fetch: typeof globalThis.fetch;
}

/** HTTPS-only, unauthenticated transport for extension-owned integrations. */
export type PluginFetch = typeof globalThis.fetch;

export type PluginAgentToolPolicy = "mutation" | "read";

export interface PluginLunarisContent {
  activeResourceId: string | null;
  activeStorage: ResourceStorageHandles;
  activeWorkspaceId: string;
  executeAgentTool(input: {
    input: Record<string, unknown>;
    name: string;
    workspaceId: string;
  }): Promise<unknown>;
  getAgentToolPolicy(name: string): PluginAgentToolPolicy | null;
  listWorkspaces(input?: {
    consistency?: "cached" | "confirmed";
    cursor?: string;
    limit?: number;
  }): Promise<PluginWorkspacesPage>;
  readYjsStorageJson(input: {
    workspaceId?: string;
    storage: ResourceStorageHandle;
  }): Promise<unknown>;
  searchResources(input: {
    consistency?: "cached" | "confirmed";
    cursor?: string;
    limit?: number;
    workspaceId?: string;
    search: string;
  }): Promise<PluginResourceSearchPage>;
}

export interface PluginResourceSearchResult {
  name: string;
  parentId: string | null;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  storage: ResourceStorageHandles;
  workspaceId: string;
  workspaceName: string;
}

export interface PluginResourceSearchPage {
  items: PluginResourceSearchResult[];
  nextCursor: string | null;
}

export interface PluginResource {
  createdAt?: string | null;
  name: string | null;
  parentId: string | null;
  position?: number | null;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  storage: ResourceStorageHandles;
  updatedAt?: string | null;
}

export type PluginResourcesMap = Map<string, PluginResource>;
export type PluginResourceChildrenMap = Map<string | null, PluginResource[]>;
export interface PluginResourceTrashState {
  purgeAt: string;
  trashedAt: string;
  trashRootId: string;
}
export type PluginResourceTrashMap = Map<string, PluginResourceTrashState>;

export interface PluginResourceBreadcrumbItem {
  isLast: boolean;
  name: string;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
}

export const PLUGIN_WORKSPACE_ROOT_ID = "__root__";

export function isPluginResourceFolder(item: PluginResource): boolean {
  return item.resourceTypeId === "lunaris.folder";
}

export interface PluginOrganizationOpenResourceInput {
  parentId?: string | null;
  replaceCurrent?: boolean;
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  title: string;
}

export interface PluginOrganizationOpenViewInput {
  extensionId: string;
  params?: JsonObject;
  route?: PluginOrganizationViewRoute;
  sourceResourceId?: string;
  title: string;
  viewId: string;
}

export interface PluginOrganizationViewRoute {
  path: string;
  resourceId: string;
  subviewId: string;
}

export function createPluginSubviewViewInstanceId({
  resourceId,
  path,
  subviewId,
}: PluginOrganizationViewRoute): string {
  return `plugin-subview:${resourceId}:${path}:${subviewId}`;
}

export interface PluginOrganizationNavigation {
  closeViewInstances: (viewInstanceIds: string[]) => void;
  /** Reveals a folder or resource in the workspace explorer. */
  navigateToWorkspaceResource: (resourceId: string) => void;
  /** Opens a stable workspace or workspace-resource reference, including across workspaces. */
  openEntityReference: (reference: PluginEntityReference) => Promise<boolean>;
  openResource: (input: PluginOrganizationOpenResourceInput) => void;
  /** Opens a resource in a separate workspace window. */
  openResourceInNewWindow: (
    input: PluginOrganizationOpenResourceInput
  ) => Promise<boolean>;
  /** Opens an extension-owned panel or routed subview. False when unsupported. */
  openView: (input: PluginOrganizationOpenViewInput) => boolean;
  /** Opens an extension-owned panel in a separate window. */
  openViewInNewWindow: (
    input: PluginOrganizationOpenViewInput
  ) => Promise<boolean>;
  setViewInstanceTitle: (viewInstanceId: string, title: string) => void;
}

export interface PluginResourceActions {
  createResource: (input: {
    resourceTypeId: string;
    initialPayload?: JsonObject;
    name: string;
    parentId: string;
  }) => Promise<ResourceCreateResult | null>;
  deleteResource: (resourceId: string) => Promise<void>;
  renameResource: (resourceId: string, name: string) => Promise<void>;
  reorderResources: (
    parentId: string,
    orderedResourceIds: string[]
  ) => Promise<void>;
  touchResource: (resourceId: string) => Promise<void>;
}

export interface PluginStableLoadingState {
  showEmpty: boolean;
  showSkeleton: boolean;
}

export interface PluginOrganizationAccess {
  canDeleteContent: boolean;
  canWriteContent: boolean;
}

export interface PluginUser {
  email?: string | null;
  id?: string;
  image?: string | null;
  name?: string | null;
}

export interface PluginCurrentUserResult {
  isLoading: boolean;
  user: PluginUser | undefined;
}

export interface PluginYjsStorageUpdateRow {
  createdAt: string;
  id: string;
  updateBase64: string;
  userId: string | null;
}

export interface PluginYjsStorageLastEditedResult {
  isLoading: boolean;
  lastEditedAt: Date | null;
}

export type PluginStoredFileStatus =
  | "archived"
  | "queued-delete"
  | "queued-download"
  | "queued-upload"
  | "synced"
  | "unknown";

export interface PluginStoredFile {
  hasSynced: boolean;
  id: string;
  localUri: string | null;
  mediaType: string | null;
  status: PluginStoredFileStatus;
}

export interface PluginStoredFileMetadata {
  fileExtension: string;
  fileId: string;
  filename: string;
  mediaType: string;
  size: number;
  uploadedAt: string;
}

export interface PluginStoredFileState {
  file: PluginStoredFile | null;
  metadata: PluginStoredFileMetadata | null;
  objectUrl: string | null;
}

export interface PluginFileStorageUploadInput {
  file: File;
  storage: ResourceStorageHandle;
}

export type StorePluginFile = (
  input: PluginFileStorageUploadInput
) => Promise<PluginStoredFileMetadata>;

/** Workspace-scoped binary storage available to every extension. */
export interface PluginFileStorage {
  download: (storage: ResourceStorageHandle) => Promise<boolean>;
  upload: StorePluginFile;
}

export const MAX_PLUGIN_DOWNLOAD_BYTES = 64 * 1024 * 1024;

export interface PluginDownloadInput {
  data: ArrayBuffer;
  mimeType: string;
  suggestedName: string;
}

export interface PluginChunkedDownloadInput {
  chunks: AsyncIterable<Uint8Array>;
  mimeType: string;
  signal?: AbortSignal;
  suggestedName: string;
}

export interface PluginDownloads {
  save(input: PluginDownloadInput): Promise<void>;
  /** Available on protocol 7 hosts. Legacy hosts only support save(). */
  saveChunks?: (input: PluginChunkedDownloadInput) => Promise<void>;
}

export function assertPluginDownloadInput(
  input: unknown
): asserts input is PluginDownloadInput {
  if (!input || typeof input !== "object") {
    throw new Error("Generated download input is invalid");
  }
  const value = input as Partial<PluginDownloadInput>;
  if (!(value.data instanceof ArrayBuffer)) {
    throw new Error("Generated download data must be an ArrayBuffer");
  }
  if (value.data.byteLength > MAX_PLUGIN_DOWNLOAD_BYTES) {
    throw new Error("Generated download exceeds the 64 MiB limit");
  }
  const filename = value.suggestedName?.trim() ?? "";
  if (
    typeof value.suggestedName !== "string" ||
    !filename ||
    filename.length > 255 ||
    filename === "." ||
    filename === ".." ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in download filenames.
    /[<>:"/\\|?*\0-\x1f]/.test(filename) ||
    /[. ]$/.test(filename)
  ) {
    throw new Error("Generated download has an invalid filename");
  }
  if (
    typeof value.mimeType !== "string" ||
    !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(
      value.mimeType
    )
  ) {
    throw new Error("Generated download has an invalid MIME type");
  }
}

/** @deprecated Use `PluginStoredFileMetadata`. */
export interface PluginFileMetadata
  extends Omit<PluginStoredFileMetadata, "fileId"> {
  attachmentId: string;
}

/** Runtime surface — host binds each hook to concrete impls from host packages. */
export interface PluginHostCapabilities {
  useApiTransport: () => PluginApiTransport;
  useCurrentUser: () => PluginCurrentUserResult;
  useCurrentWorkspace: () => PluginCurrentWorkspace;
  useDownloads: () => PluginDownloads;
  useFileStorage: () => PluginFileStorage;
  useLocale: () => { locale: string };
  useLunarisContent: () => PluginLunarisContent;
  useOrganizationAccess?: () => PluginOrganizationAccess;
  useOrganizationNavigation: () => PluginOrganizationNavigation;
  useOrgMembersMap: () => { isLoading: boolean; map: Map<string, PluginUser> };
  usePluginFetch: () => PluginFetch;
  useResourceReadContext: () => PluginResourceReadContext;
  useStableInitialLoading: (opts: {
    dataEmpty: boolean;
    extraGate?: boolean;
  }) => PluginStableLoadingState;
  useStoredFile: (storage: ResourceStorageHandle) => PluginStoredFileState;
  useWorkspaceChildrenMap: () => PluginResourceChildrenMap;
  useWorkspaceResourceActions: () => PluginResourceActions;
  useWorkspaceResourceBreadcrumb: (
    resourceId: string
  ) => PluginResourceBreadcrumbItem[];
  useWorkspaceResourceName: (resourceId: string) => string;
  useWorkspaceResourcesMap: () => PluginResourcesMap;
  useWorkspaceTrashMap: () => PluginResourceTrashMap;
  useYjsStorageLastEdited: (
    storage: ResourceStorageHandle
  ) => PluginYjsStorageLastEditedResult;
  useYjsStorageUpdateRows: () => (
    storage: ResourceStorageHandle
  ) => Promise<PluginYjsStorageUpdateRow[]>;
}

export function usePluginHostCapabilities(): PluginHostCapabilities {
  return usePluginSdkRuntime().host;
}

// ---------------------------------------------------------------------------
// Extension-facing SDK hooks
// ---------------------------------------------------------------------------

export function useApiTransport(): PluginApiTransport {
  usePluginPermission("network.https");
  return usePluginHostCapabilities().useApiTransport();
}

/** Current workspace ID + shape — read from host runtime. */
export function useCurrentWorkspace(): PluginCurrentWorkspace {
  return usePluginHostCapabilities().useCurrentWorkspace();
}

export function useLocale(): { locale: string } {
  return usePluginHostCapabilities().useLocale();
}

/**
 * Fetch third-party HTTPS resources without Lunaris session credentials.
 * Browser calls remain subject to CORS.
 */
export function usePluginFetch(): PluginFetch {
  usePluginPermission("network.https");
  return usePluginHostCapabilities().usePluginFetch();
}

export function useLunarisContent(): PluginLunarisContent {
  usePluginPermission("content.read");
  usePluginPermission("content.write");
  return usePluginHostCapabilities().useLunarisContent();
}

export function useWorkspaceResourcesMap(): PluginResourcesMap {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useWorkspaceResourcesMap();
}

export function useWorkspaceTrashMap(): PluginResourceTrashMap {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useWorkspaceTrashMap();
}

export function useWorkspaceChildrenMap(): PluginResourceChildrenMap {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useWorkspaceChildrenMap();
}

export function useWorkspaceResourceBreadcrumb(
  resourceId: string
): PluginResourceBreadcrumbItem[] {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useWorkspaceResourceBreadcrumb(resourceId);
}

export function useWorkspaceResourceActions(): PluginResourceActions {
  usePluginPermission("content.write");
  return usePluginHostCapabilities().useWorkspaceResourceActions();
}

export function useWorkspaceResourceName(resourceId: string): string {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useWorkspaceResourceName(resourceId);
}

export function useOrganizationNavigation(): PluginOrganizationNavigation {
  return usePluginHostCapabilities().useOrganizationNavigation();
}

export function useOrganizationAccess(): PluginOrganizationAccess {
  return (
    usePluginHostCapabilities().useOrganizationAccess?.() ?? {
      canDeleteContent: true,
      canWriteContent: true,
    }
  );
}

export function useStableInitialLoading(opts: {
  dataEmpty: boolean;
  extraGate?: boolean;
}): PluginStableLoadingState {
  return usePluginHostCapabilities().useStableInitialLoading(opts);
}

export function useCurrentUser(): PluginCurrentUserResult {
  return usePluginHostCapabilities().useCurrentUser();
}

export function useOrgMembersMap(): {
  isLoading: boolean;
  map: Map<string, PluginUser>;
} {
  return usePluginHostCapabilities().useOrgMembersMap();
}

export function useYjsStorageLastEdited(
  storage: ResourceStorageHandle
): PluginYjsStorageLastEditedResult {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useYjsStorageLastEdited(storage);
}

export function useYjsStorageUpdateRows(): ReturnType<
  PluginHostCapabilities["useYjsStorageUpdateRows"]
> {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useYjsStorageUpdateRows();
}

/** Access workspace-scoped binary storage without extension-specific APIs. */
export function useFileStorage(): PluginFileStorage {
  usePluginPermission("files.read");
  usePluginPermission("files.write");
  return usePluginHostCapabilities().useFileStorage();
}

/** Observe stored-file state for an extension-owned workspace resource. */
export function useStoredFile(
  storage: ResourceStorageHandle
): PluginStoredFileState {
  usePluginPermission("files.read");
  if (storage.kind !== "file") {
    throw new Error("useStoredFile requires a file storage handle");
  }
  return usePluginHostCapabilities().useStoredFile(storage);
}

export function usePluginResourceReadContext(): PluginResourceReadContext {
  usePluginPermission("content.read");
  return usePluginHostCapabilities().useResourceReadContext();
}

export function useDownloads(): PluginDownloads {
  usePluginPermission("downloads.write");
  return usePluginHostCapabilities().useDownloads();
}
