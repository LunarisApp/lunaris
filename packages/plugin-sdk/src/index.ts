/**
 * Public API entry point for @lunarisapp/plugin-sdk.
 *
 * Types, pure utilities, and host-injected hooks that extensions
 * and host both rely on. Official host bindings live in Lunaris app-shell.
 */

export type {
  PluginResourceData,
  PluginResourceReadContext,
  PluginResourceResolution,
} from "./resource-data";
export type { IconSvgObject, PluginIconSource } from "./constants";
export {
  entityReferenceKey,
  findMentionTrigger,
  insertMention,
  workspaceResourceToEntityReferenceOption,
  workspaceToEntityReferenceOption,
  searchResultToEntityReferenceOption,
  uniqueEntityReferenceOptions,
} from "./entity-references";
export type {
  PluginEntityReference,
  PluginEntityReferenceKind,
  PluginEntityReferenceOption,
  PluginMentionTrigger,
} from "./entity-references";
export { useEntityReferenceSearch } from "./entity-reference-hooks";
export type {
  PluginReadyYjsDocument,
  PluginStorageValue,
  PluginYArrayApi,
  PluginYjsPersistenceState,
  PluginYjsProvider,
} from "./data-adapter";
export {
  useKeyValue,
  useWorkspaceKeyValue,
  useYjsStorage,
  useYArray,
  useYMapField,
  useYMapJson,
  useYMapTags,
} from "./data-hooks";
export type {
  ActivatedPluginContributions,
  PluginActivationContext,
  PluginContributionRegistrar,
  PluginDefinition,
  PluginDefinitionInput,
  PluginDescriptor,
  PluginDescriptorInput,
  PluginMetadata,
  PluginContribution,
  PluginDisposable,
  PluginEffect,
  PluginModule,
  PreparedPluginActivation,
  PluginSubviewRouteMetadata,
  WorkspaceStorageContribution,
  ResourceCommandRegistration,
  ResourceTypeContribution,
  SearchIndexerRegistration,
  SearchQueryRegistration,
  ViewContribution,
} from "./definition";
export {
  createViewInstanceId,
  defineWorkspaceStorage,
  defineResourceType,
  definePlugin,
  definePluginDescriptor,
  defineView,
  descriptorMetadata,
  getResourceCommandContributions,
  getWorkspaceStorageContributions,
  getResourceTypeContributions,
  getSearchIndexerContributions,
  getSearchQueryContributions,
  getViewIdFromInstanceId,
  getViewContributions,
  loadPluginDescriptor,
  preparePluginActivation,
} from "./definition";
export type { JsonObject, JsonPrimitive, JsonValue } from "./json";
export type {
  ManifestValidationError,
  PluginManifest,
  PluginPermission,
  ApiVersionMismatchError,
} from "./manifest";
export type {
  PluginSandboxRuntimeRequirement,
  SandboxResourceCommandContext,
  SandboxHostRequest,
  SandboxPluginMessage,
  SandboxWireObject,
  SandboxWireValue,
  SerializedSandboxCommand,
  SerializedSandboxResourceCommand,
  SerializedSandboxServiceProvider,
  SerializedSandboxSlotContribution,
  SerializedSandboxSearchIndexer,
  SerializedSandboxSearchQuery,
  SerializedSandboxResourceType,
  SerializedSandboxPluginDefinition,
  SerializedSandboxView,
} from "./sandbox-protocol";
export {
  PLUGIN_SANDBOX_BOOTSTRAP_CSP,
  PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
  PLUGIN_SANDBOX_PROTOCOL_VERSION,
  isSupportedSandboxProtocol,
  PLUGIN_SANDBOX_RPC_TIMEOUT_MS,
  PLUGIN_SANDBOX_RUNTIME,
  sandboxHandlerKey,
} from "./sandbox-protocol";
export {
  isPluginApiRangeSupported,
  PLUGIN_API_VERSION,
  PLUGIN_API_SUPPORTED_VERSIONS,
  PLUGIN_PERMISSIONS,
  validateManifest,
} from "./manifest";
export { ViewReady, createPreloadableLazy } from "./preloadable-lazy";
export {
  matchesResourceTarget,
  useWorkspaceStorageDefinition,
  useResourceType,
  useResourceCommands,
  useOptionalPluginService,
  usePluginService,
  usePluginServiceSlot,
  useSearchIndexers,
  useSearchQueries,
  useResourceTypes,
  useView,
  useViews,
} from "./provider";
export type {
  OwnedContribution,
  RegisteredWorkspaceStorage,
  RegisteredResourceType,
  RegisteredResourceCommand,
  RegisteredSearchIndexer,
  RegisteredSearchQuery,
  RegisteredView,
} from "./provider";
export { resolveResource } from "./resource-resolution";
export type {
  ResourceResolution,
  ResourceVersionCommitter,
} from "./resource-resolution";
export type {
  PluginAgentToolPolicy,
  PluginApiTransport,
  PluginCurrentWorkspace,
  PluginCurrentUserResult,
  PluginFileStorage,
  PluginFileStorageUploadInput,
  PluginDownloadInput,
  PluginDownloads,
  PluginFileMetadata,
  PluginFetch,
  PluginLunarisContent,
  PluginResource,
  PluginResourceActions,
  PluginResourceBreadcrumbItem,
  PluginResourceChildrenMap,
  PluginResourceSearchPage,
  PluginResourceSearchResult,
  PluginResourceTrashMap,
  PluginResourceTrashState,
  PluginResourcesMap,
  PluginWorkspacesPage,
  PluginWorkspaceSummary,
  PluginStableLoadingState,
  PluginStoredFile,
  PluginStoredFileMetadata,
  PluginStoredFileState,
  PluginStoredFileStatus,
  PluginUser,
  PluginOrganizationAccess,
  PluginOrganizationNavigation,
  PluginOrganizationOpenViewInput,
  PluginOrganizationOpenResourceInput,
  PluginOrganizationViewRoute,
  PluginYjsStorageLastEditedResult,
  PluginYjsStorageUpdateRow,
  StorePluginFile,
} from "./runtime-context";
export {
  createPluginSubviewViewInstanceId,
  isPluginResourceFolder,
  PLUGIN_WORKSPACE_ROOT_ID,
  useApiTransport,
  useCurrentWorkspace,
  useCurrentUser,
  useFileStorage,
  useLocale,
  usePluginFetch,
  useLunarisContent,
  useOrgMembersMap,
  useDownloads,
  usePluginResourceReadContext,
  useWorkspaceChildrenMap,
  useWorkspaceResourceActions,
  useWorkspaceResourceBreadcrumb,
  useWorkspaceResourceName,
  useWorkspaceResourcesMap,
  useWorkspaceTrashMap,
  useStableInitialLoading,
  useStoredFile,
  useOrganizationAccess,
  useOrganizationNavigation,
  useYjsStorageLastEdited,
  useYjsStorageUpdateRows,
} from "./runtime-context";
export { useExtensionId } from "./scope";
export type {
  OpenViewInput,
  ResourceCommand,
  ResourceCommandContext,
  ResourceCommandContribution,
  ResourceCommandGroup,
  ResourceCommandItem,
  ResourceCreationContext,
  ResourceCreateResult,
  ResourceTypeDefinition,
  ResourceEnvelope,
  ResourceHierarchyDefinition,
  ResourceInitializeContext,
  ResourceMigration,
  ResourcePayloadContext,
  ResourcePayloadStorage,
  SearchIndexFile,
  SearchIndexerContext,
  SearchIndexerContribution,
  SearchIndexerInput,
  SearchQueryContext,
  SearchQueryContribution,
  SearchQueryInput,
  SearchQueryOpenContext,
  SearchQueryPage,
  SearchQueryResult,
  ResourceSchemaDefinition,
  WorkspaceStorageDefinition,
  ResourceStorageDefinition,
  ResourceStorageHandle,
  ResourceStorageHandles,
  ResourceStorageKind,
  ResourceStorageSlotDefinition,
  ResourceTypeTarget,
  ResourceViewProps,
  ResourceViewStatusProps,
  ResourceViewDefinition,
  StandaloneViewProps,
  StandaloneViewDefinition,
  ViewDefinition,
  ViewPlacement,
  ViewRendererProps,
  ViewTarget,
} from "./types";
export {
  definePluginService,
} from "./services";
export type {
  PluginServiceDefinition,
  PluginServiceMethod,
  PluginServiceMethods,
  PluginServiceProviderRegistration,
  PluginServiceReference,
  PluginServiceSlotContribution,
  PluginServiceSlotDefinition,
  PluginServiceSlotRegistration,
  PluginServiceSnapshot,
  PluginServiceStore,
  RegisteredPluginService,
  RegisteredPluginServiceSlotContribution,
} from "./services";
export {
  MAX_PLUGIN_DOWNLOAD_BYTES,
  assertPluginDownloadInput,
} from "./runtime-context";

export { PluginDownloadReceiver, saveRemoteChunks } from "./downloads";
export type { PluginChunkedDownloadInput } from "./runtime-context";

export { YjsUpdateJournal, type YjsSyncCursor } from "./yjs-journal";

export { useYjsAwareness } from "./awareness";
export type {
  PluginAwarenessResult,
  PluginAwarenessStatus,
  PluginAwarenessOptions,
} from "./awareness";

export { useResourcePresence, useResourceAwareness, ResourceViewPresenceProvider, useResourceViewPresenceScope, UNAVAILABLE_RESOURCE_PRESENCE } from "./resource-presence";
export type { PresenceUser, ResourcePresenceResult, ResourceAwarenessResult, ResourceAwarenessPeer, ResourceViewPresenceScope } from "./resource-presence";
