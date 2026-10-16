import type {
  PluginDefinition,
  PluginDisposable,
  RegisteredWorkspaceStorage,
  RegisteredResourceType,
  RegisteredResourceCommand,
  RegisteredPluginService,
  RegisteredPluginServiceSlotContribution,
  RegisteredSearchIndexer,
  RegisteredSearchQuery,
  RegisteredView,
  ResourceCommandRegistration,
  WorkspaceStorageContribution,
  ResourceTypeContribution,
  PluginServiceDefinition,
  PluginServiceMethods,
  PluginServiceProviderRegistration,
  PluginServiceSlotDefinition,
  PluginServiceSlotRegistration,
  SandboxWireValue,
  SearchIndexerRegistration,
  SearchQueryRegistration,
  ViewContribution,
} from "@lunarisapp/plugin-sdk";
import { cloneSandboxWireValue } from "@lunarisapp/plugin-sdk/internal";
import { satisfies } from "semver";
import { z } from "zod";

const corePlugin: PluginDefinition = {
  activate: () => undefined,
  manifest: {
    api: "^0.9.0",
    conflicts: {},
    dependencies: {},
    optionalDependencies: {},
    description: "Core hierarchy resources",
    developer: "Lunaris",
    id: "lunaris",
    name: "Lunaris Core",
    permissions: [],
    version: "1.0.0",
  },
};

const folderResourceType: ResourceTypeContribution = {
  hierarchy: { userCreatable: false, visible: true },
  icon: [],
  name: "Folder",
  resourceTypeId: "lunaris.folder",
  schema: {
    currentVersion: 1,
    id: "lunaris.folder",
    read: () => null,
    versions: { 1: z.null() },
  },
  storage: {},
  type: "resource-type",
};

function isCompatibleServiceVersion(
  providerVersion: string,
  consumerVersion: string
): boolean {
  return satisfies(providerVersion, `^${consumerVersion}`);
}

/** Reactive capability services whose registrations are owned by Cordis effects. */
export class PluginRegistry {
  private batchDepth = 0;
  private commands = new Map<string, RegisteredResourceCommand>();
  private listeners = new Set<() => void>();
  private notificationPending = false;
  private plugins = new Map<string, PluginDefinition>();
  private workspaceStorages = new Map<string, RegisteredWorkspaceStorage>();
  private resourceTypes = new Map<string, RegisteredResourceType>();
  private searchIndexers = new Map<string, RegisteredSearchIndexer>();
  private searchQueries = new Map<string, RegisteredSearchQuery>();
  private services = new Map<string, RegisteredPluginService>();
  private slots = new Map<string, RegisteredPluginServiceSlotContribution>();
  private version = 0;
  private views = new Map<string, RegisteredView>();

  constructor() {
    this.plugins.set(corePlugin.manifest.id, corePlugin);
    this.resourceTypes.set(folderResourceType.resourceTypeId, {
      definition: folderResourceType,
      extensionId: corePlugin.manifest.id,
      extensionVersion: corePlugin.manifest.version,
    });
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get(id: string): PluginDefinition | undefined {
    return this.plugins.get(id);
  }

  registerPlugin(plugin: PluginDefinition): PluginDisposable {
    const id = plugin.manifest.id;
    if (this.plugins.has(id)) {
      throw new Error(`Extension "${id}" is already registered`);
    }
    this.plugins.set(id, plugin);
    this.notifyListeners();
    return () => this.unregister(this.plugins, id);
  }

  registerResourceType(
    extensionId: string,
    definition: ResourceTypeContribution
  ): PluginDisposable {
    for (const resourceType of this.resourceTypes.values()) {
      if (resourceType.definition.schema.id === definition.schema.id) {
        throw new Error(
          `Resource schema "${definition.schema.id}" is already registered`
        );
      }
    }
    return this.registerContribution(
      this.resourceTypes,
      "Resource type",
      extensionId,
      definition,
      definition.resourceTypeId
    );
  }

  registerWorkspaceStorage(
    extensionId: string,
    definition: WorkspaceStorageContribution
  ): PluginDisposable {
    return this.registerContribution(
      this.workspaceStorages,
      "Workspace storage",
      extensionId,
      definition,
      definition.storageId
    );
  }

  registerView(
    extensionId: string,
    definition: ViewContribution
  ): PluginDisposable {
    return this.registerContribution(
      this.views,
      "View",
      extensionId,
      definition,
      definition.viewId
    );
  }

  registerCommand(
    extensionId: string,
    definition: ResourceCommandRegistration
  ): PluginDisposable {
    return this.registerContribution(
      this.commands,
      "Resource command",
      extensionId,
      definition,
      definition.id
    );
  }

  registerService(
    extensionId: string,
    registration: PluginServiceProviderRegistration
  ): PluginDisposable {
    const plugin = this.plugins.get(extensionId);
    if (!plugin) {
      throw new Error(`Extension "${extensionId}" is not registered`);
    }
    const { definition, implementation } = registration;
    if (
      definition.id !== extensionId &&
      !definition.id.startsWith(`${extensionId}.`)
    ) {
      throw new Error(
        `Extension "${extensionId}" cannot provide service "${definition.id}"`
      );
    }
    if (definition.version !== plugin.manifest.version) {
      throw new Error(
        `Service "${definition.id}" version does not match its provider`
      );
    }
    if (this.services.has(definition.id)) {
      throw new Error(
        `Extension service "${definition.id}" is already registered`
      );
    }
    this.services.set(definition.id, {
      definition,
      implementation,
      providerId: extensionId,
      providerVersion: plugin.manifest.version,
    });
    this.notifyListeners();
    return () => this.unregister(this.services, definition.id);
  }

  registerSlotContribution(
    extensionId: string,
    registration: PluginServiceSlotRegistration
  ): PluginDisposable {
    const plugin = this.plugins.get(extensionId);
    if (!plugin) {
      throw new Error(`Extension "${extensionId}" is not registered`);
    }
    const { contribution, slot } = registration;
    const range = this.dependencyRange(plugin, slot.serviceId);
    if (!(range && satisfies(slot.serviceVersion, range))) {
      throw new Error(
        `Extension "${extensionId}" cannot contribute to service "${slot.serviceId}"`
      );
    }
    const key = this.slotKey(slot, extensionId, contribution.id);
    if (this.slots.has(key)) {
      throw new Error(
        `Extension service slot contribution "${contribution.id}" is already registered`
      );
    }
    this.slots.set(key, {
      contributorId: extensionId,
      contributorVersion: plugin.manifest.version,
      id: contribution.id,
      invoke: async (input) => {
        const output = await contribution.invoke(
          cloneSandboxWireValue(input, "Extension slot input") as never
        );
        return cloneSandboxWireValue(output, "Extension slot result") as never;
      },
      metadata: contribution.metadata,
      slot,
    });
    this.notifyListeners();
    return () => this.unregister(this.slots, key);
  }

  registerSearchIndexer(
    extensionId: string,
    definition: SearchIndexerRegistration
  ): PluginDisposable {
    return this.registerContribution(
      this.searchIndexers,
      "Search indexer",
      extensionId,
      definition,
      definition.id
    );
  }

  registerSearchQuery(
    extensionId: string,
    definition: SearchQueryRegistration
  ): PluginDisposable {
    return this.registerContribution(
      this.searchQueries,
      "Search query provider",
      extensionId,
      definition,
      definition.id
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getVersion(): number {
    return this.version;
  }

  transaction<T>(operation: () => T): T {
    this.batchDepth += 1;
    try {
      return operation();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.notificationPending) {
        this.notificationPending = false;
        this.notifyListeners();
      }
    }
  }

  getResourceTypes(): RegisteredResourceType[] {
    return [...this.resourceTypes.values()];
  }

  getWorkspaceStorages(): RegisteredWorkspaceStorage[] {
    return [...this.workspaceStorages.values()];
  }

  getWorkspaceStorage(
    storageId: string
  ): RegisteredWorkspaceStorage | undefined {
    return this.workspaceStorages.get(storageId);
  }

  getResourceType(resourceTypeId: string): RegisteredResourceType | undefined {
    return this.resourceTypes.get(resourceTypeId);
  }

  getViews(): RegisteredView[] {
    return [...this.views.values()];
  }

  getView(id: string): RegisteredView | undefined {
    return this.views.get(id);
  }

  getCommands(): RegisteredResourceCommand[] {
    return [...this.commands.values()];
  }

  getService<TMethods extends PluginServiceMethods>(
    consumerId: string,
    definition: PluginServiceDefinition<TMethods>
  ): RegisteredPluginService<TMethods> | undefined {
    const service = this.services.get(definition.id);
    if (
      !(
        service &&
        isCompatibleServiceVersion(
          service.definition.version,
          definition.version
        ) &&
        this.canConsume(consumerId, service.providerId, service.providerVersion)
      )
    ) {
      return undefined;
    }
    return service as unknown as RegisteredPluginService<TMethods>;
  }

  getSlotContributions<TMetadata extends object, TInput, TOutput>(
    consumerId: string,
    slot: PluginServiceSlotDefinition<TMetadata, TInput, TOutput>
  ): RegisteredPluginServiceSlotContribution<TMetadata, TInput, TOutput>[] {
    const service = this.services.get(slot.serviceId);
    if (
      !(
        service &&
        isCompatibleServiceVersion(
          service.definition.version,
          slot.serviceVersion
        ) &&
        this.canConsume(consumerId, service.providerId, service.providerVersion)
      )
    ) {
      return [];
    }
    return [...this.slots.values()]
      .filter(
        (entry) =>
          entry.slot.serviceId === slot.serviceId &&
          isCompatibleServiceVersion(
            slot.serviceVersion,
            entry.slot.serviceVersion
          ) &&
          entry.slot.id === slot.id
      )
      .sort((left, right) =>
        `${left.contributorId}:${left.id}`.localeCompare(
          `${right.contributorId}:${right.id}`
        )
      ) as unknown as RegisteredPluginServiceSlotContribution<
      TMetadata,
      TInput,
      TOutput
    >[];
  }

  async invokeService(
    consumerId: string,
    serviceId: string,
    method: string,
    input: SandboxWireValue
  ): Promise<SandboxWireValue | undefined> {
    const service = this.services.get(serviceId);
    if (
      !(
        service &&
        this.canConsume(consumerId, service.providerId, service.providerVersion)
      )
    ) {
      throw new Error(`Extension service "${serviceId}" is unavailable`);
    }
    if (!service.definition.methods.includes(method)) {
      throw new Error(
        `Extension service "${serviceId}" has no method "${method}"`
      );
    }
    const output = await service.implementation[method]?.(
      cloneSandboxWireValue(input, "Extension service input")
    );
    return output === undefined
      ? undefined
      : cloneSandboxWireValue(output, "Extension service result");
  }

  async invokeSlot(
    consumerId: string,
    registrationId: string,
    input: SandboxWireValue
  ): Promise<SandboxWireValue> {
    const registration = this.slots.get(registrationId);
    if (!registration) {
      throw new Error("Extension service slot is unavailable");
    }
    const service = this.services.get(registration.slot.serviceId);
    if (
      !(
        service &&
        isCompatibleServiceVersion(
          service.definition.version,
          registration.slot.serviceVersion
        ) &&
        this.canConsume(consumerId, service.providerId, service.providerVersion)
      )
    ) {
      throw new Error(
        `Extension service "${registration.slot.serviceId}" is unavailable`
      );
    }
    return registration.invoke(input);
  }

  snapshot(consumerId: string) {
    const providers = [...this.services.values()]
      .filter((service) =>
        this.canConsume(consumerId, service.providerId, service.providerVersion)
      )
      .map((service) => ({
        id: service.definition.id,
        methods: [...service.definition.methods],
        version: service.providerVersion,
      }));
    const providerVersions = new Map(
      providers.map(({ id, version }) => [id, version])
    );
    const slots = [...this.slots.entries()]
      .filter(([, entry]) =>
        isCompatibleServiceVersion(
          providerVersions.get(entry.slot.serviceId) ?? "",
          entry.slot.serviceVersion
        )
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([registrationId, entry]) => ({
        contributorId: entry.contributorId,
        contributorVersion: entry.contributorVersion,
        id: entry.id,
        metadata: entry.metadata,
        registrationId,
        serviceId: entry.slot.serviceId,
        serviceVersion: entry.slot.serviceVersion,
        slotId: entry.slot.id,
      }));
    return { providers, slots, version: this.version };
  }

  getSearchIndexers(): RegisteredSearchIndexer[] {
    return [...this.searchIndexers.values()];
  }

  getSearchQueries(): RegisteredSearchQuery[] {
    return [...this.searchQueries.values()];
  }

  private registerContribution<T>(
    registry: Map<
      string,
      { definition: T; extensionId: string; extensionVersion: string }
    >,
    label: string,
    extensionId: string,
    definition: T,
    id: string
  ): PluginDisposable {
    if (registry.has(id)) {
      throw new Error(`${label} "${id}" is already registered`);
    }
    const extensionVersion = this.plugins.get(extensionId)?.manifest.version;
    if (!extensionVersion) {
      throw new Error(`Extension "${extensionId}" is not registered`);
    }
    registry.set(id, { definition, extensionId, extensionVersion });
    this.notifyListeners();
    return () => this.unregister(registry, id);
  }

  private canConsume(
    consumerId: string,
    providerId: string,
    providerVersion: string
  ): boolean {
    if (consumerId === providerId) {
      return true;
    }
    const consumer = this.plugins.get(consumerId);
    const range = consumer
      ? (consumer.manifest.dependencies[providerId] ??
        consumer.manifest.optionalDependencies[providerId])
      : undefined;
    return Boolean(range && satisfies(providerVersion, range));
  }

  private dependencyRange(
    plugin: PluginDefinition,
    serviceId: string
  ): string | undefined {
    return Object.entries({
      ...plugin.manifest.optionalDependencies,
      ...plugin.manifest.dependencies,
    })
      .filter(
        ([dependencyId]) =>
          serviceId === dependencyId || serviceId.startsWith(`${dependencyId}.`)
      )
      .sort(([left], [right]) => right.length - left.length)[0]?.[1];
  }

  private slotKey(
    slot: PluginServiceSlotDefinition,
    contributorId: string,
    contributionId: string
  ): string {
    return `${slot.serviceId}:${slot.id}:${contributorId}:${contributionId}`;
  }

  private unregister<T>(registry: Map<string, T>, id: string): void {
    if (registry.delete(id)) {
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    if (this.batchDepth > 0) {
      this.notificationPending = true;
      return;
    }
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export type { RegisteredView } from "@lunarisapp/plugin-sdk";
