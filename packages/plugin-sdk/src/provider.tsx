import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { PluginDataCapabilities } from "./data-adapter";
import type {
  WorkspaceStorageContribution,
  ResourceCommandRegistration,
  ResourceTypeContribution,
  SearchIndexerRegistration,
  SearchQueryRegistration,
  ViewContribution,
} from "./definition";
import type { PluginHostCapabilities } from "./runtime-context";
import type { ResourceEnvelope, ResourceTypeTarget } from "./types";
import type {
  PluginServiceDefinition,
  PluginServiceMethods,
  PluginServiceSlotDefinition,
  PluginServiceStore,
  RegisteredPluginServiceSlotContribution,
} from "./services";
import { useExtensionId } from "./scope";

export interface OwnedContribution<T> {
  definition: T;
  extensionId: string;
  extensionVersion: string;
}

export type RegisteredResourceType = OwnedContribution<ResourceTypeContribution>;
export type RegisteredWorkspaceStorage = OwnedContribution<WorkspaceStorageContribution>;
export type RegisteredView = OwnedContribution<ViewContribution>;
export type RegisteredResourceCommand = OwnedContribution<ResourceCommandRegistration>;
export type RegisteredSearchIndexer = OwnedContribution<SearchIndexerRegistration>;
export type RegisteredSearchQuery = OwnedContribution<SearchQueryRegistration>;

export interface PluginContributionStore {
  getCommands(): RegisteredResourceCommand[];
  getResourceType(resourceTypeId: string): RegisteredResourceType | undefined;
  getResourceTypes(): RegisteredResourceType[];
  getSearchIndexers(): RegisteredSearchIndexer[];
  getSearchQueries(): RegisteredSearchQuery[];
  getVersion(): number;
  getView(viewId: string): RegisteredView | undefined;
  getViews(): RegisteredView[];
  getWorkspaceStorage(storageId: string): RegisteredWorkspaceStorage | undefined;
  getWorkspaceStorages(): RegisteredWorkspaceStorage[];
  subscribe(listener: () => void): () => void;
}

export function storageRequirementsMatch(
  requirements: Readonly<Record<string, import("./types").ResourceStorageKind>>,
  storage: import("./types").ResourceStorageDefinition,
): boolean {
  return Object.entries(requirements).every(
    ([name, kind]) => storage[name]?.kind === kind,
  );
}

export interface PluginSdkRuntime {
  contributions: PluginContributionStore;
  data: PluginDataCapabilities;
  host: PluginHostCapabilities;
  services: PluginServiceStore;
}

const ExtensionSdkContext = createContext<PluginSdkRuntime | null>(null);

export function ExtensionSdkProvider({
  children,
  runtime,
}: {
  children: ReactNode;
  runtime: PluginSdkRuntime;
}) {
  return (
    <ExtensionSdkContext.Provider value={runtime}>
      {children}
    </ExtensionSdkContext.Provider>
  );
}

export function usePluginSdkRuntime(): PluginSdkRuntime {
  const runtime = useContext(ExtensionSdkContext);
  if (!runtime) throw new Error("ExtensionHostProvider must wrap extension consumers");
  return runtime;
}

function useContributionVersion(): number {
  const { contributions } = usePluginSdkRuntime();
  const subscribe = useCallback(
    (listener: () => void) => contributions.subscribe(listener),
    [contributions],
  );
  const getSnapshot = useCallback(
    () => contributions.getVersion(),
    [contributions],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useServiceVersion(): number {
  const { services } = usePluginSdkRuntime();
  const subscribe = useCallback(
    (listener: () => void) => services.subscribe(listener),
    [services],
  );
  const getSnapshot = useCallback(() => services.getVersion(), [services]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function usePluginService<TMethods extends PluginServiceMethods>(
  definition: PluginServiceDefinition<TMethods>,
): TMethods {
  const extensionId = useExtensionId();
  const { services } = usePluginSdkRuntime();
  const version = useServiceVersion();
  const registration = useMemo(
    () => services.getService(extensionId, definition),
    [definition, extensionId, services, version],
  );
  if (!registration) {
    throw new Error(`Extension service "${definition.id}" is unavailable`);
  }
  return registration.implementation;
}

export function useOptionalPluginService<TMethods extends PluginServiceMethods>(
  definition: PluginServiceDefinition<TMethods>,
): TMethods | undefined {
  const extensionId = useExtensionId();
  const { services } = usePluginSdkRuntime();
  const version = useServiceVersion();
  return useMemo(
    () => services.getService(extensionId, definition)?.implementation,
    [definition, extensionId, services, version],
  );
}

export function usePluginServiceSlot<
  TMetadata extends object,
  TInput,
  TOutput,
>(
  slot: PluginServiceSlotDefinition<TMetadata, TInput, TOutput>,
): RegisteredPluginServiceSlotContribution<TMetadata, TInput, TOutput>[] {
  const extensionId = useExtensionId();
  const { services } = usePluginSdkRuntime();
  const version = useServiceVersion();
  return useMemo(
    () => services.getSlotContributions(extensionId, slot),
    [extensionId, services, slot, version],
  );
}

export function matchesResourceTarget(
  target: ResourceTypeTarget,
  resource: Pick<ResourceEnvelope, "resourceTypeId" | "schemaId" | "schemaVersion">,
): boolean {
  const typeMatches =
    !target.resourceTypeIds?.length ||
    target.resourceTypeIds.includes(resource.resourceTypeId);
  const schemaMatches =
    !target.schemas?.length ||
    target.schemas.some(
      ({ id, maximumVersion = Number.POSITIVE_INFINITY, minimumVersion = 1 }) =>
        id === resource.schemaId &&
        resource.schemaVersion >= minimumVersion &&
        resource.schemaVersion <= maximumVersion,
    );
  return typeMatches && schemaMatches;
}

export function useResourceTypes(): ResourceTypeContribution[] {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(
    () => contributions.getResourceTypes().map(({ definition }) => definition),
    [contributions, version],
  );
}

export function useWorkspaceStorageDefinition(
  storageId: string,
): RegisteredWorkspaceStorage | undefined {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(
    () => contributions.getWorkspaceStorage(storageId),
    [contributions, storageId, version],
  );
}

export function useResourceType(
  resourceTypeId: string,
): ResourceTypeContribution | undefined {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(
    () => contributions.getResourceType(resourceTypeId)?.definition,
    [contributions, resourceTypeId, version],
  );
}

export function useViews(): RegisteredView[] {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(() => contributions.getViews(), [contributions, version]);
}

export function useView(viewId: string): RegisteredView | undefined {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(
    () => contributions.getView(viewId),
    [contributions, version, viewId],
  );
}

export function useResourceCommands(
  resource: ResourceEnvelope | undefined,
): RegisteredResourceCommand[] {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(
    () =>
      resource
        ? contributions
            .getCommands()
            .filter(({ definition }) => matchesResourceTarget(definition, resource))
        : [],
    [contributions, resource, version],
  );
}

export function useSearchIndexers(): RegisteredSearchIndexer[] {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(
    () => contributions.getSearchIndexers(),
    [contributions, version],
  );
}

export function useSearchQueries(): RegisteredSearchQuery[] {
  const { contributions } = usePluginSdkRuntime();
  const version = useContributionVersion();
  return useMemo(
    () => contributions.getSearchQueries(),
    [contributions, version],
  );
}
