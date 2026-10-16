import type { PluginIconSource } from "./constants";
import { satisfies } from "semver";
import { type PluginManifest, validateSupportedManifest } from "./manifest";
import type {
  ResourceCommandContribution,
  WorkspaceStorageDefinition,
  ResourceTypeDefinition,
  SearchIndexerContribution,
  SearchQueryContribution,
  ResourceTypeTarget,
  ResourceViewDefinition,
  ViewDefinition,
  ResourceStorageKind,
} from "./types";
import type {
  PluginServiceDefinition,
  PluginServiceMethods,
  PluginServiceProviderRegistration,
  PluginServiceReference,
  PluginServiceSlotContribution,
  PluginServiceSlotDefinition,
  PluginServiceSlotRegistration,
} from "./services";
import {
  cloneSandboxWireValue,
  type SandboxWireObject,
} from "./sandbox-protocol";

const STORAGE_KINDS = new Set<ResourceStorageKind>([
  "file",
  "key-value",
  "yjs",
]);

function isStorageKind(value: unknown): value is ResourceStorageKind {
  return STORAGE_KINDS.has(value as ResourceStorageKind);
}

export type ResourceTypeContribution = ResourceTypeDefinition & {
  type: "resource-type";
};
export type ViewContribution = ViewDefinition & { type: "view" };
export type ResourceCommandRegistration = ResourceCommandContribution & {
  type: "resource-command";
};
export type WorkspaceStorageContribution = WorkspaceStorageDefinition & {
  type: "workspace-storage";
};
export type SearchIndexerRegistration = SearchIndexerContribution & {
  type: "search-indexer";
};
export type SearchQueryRegistration = SearchQueryContribution & {
  type: "search-query";
};

export type PluginContribution =
  | ResourceCommandRegistration
  | WorkspaceStorageContribution
  | ResourceTypeContribution
  | SearchIndexerRegistration
  | SearchQueryRegistration
  | ViewContribution;

export type PluginDisposable = () => Promise<void> | void;
export type PluginEffect = (
  signal: AbortSignal
) => PluginDisposable | Promise<PluginDisposable | void> | void;

export interface PluginContributionRegistrar {
  command(definition: ResourceCommandContribution): void;
  locales(resources: Readonly<Record<string, Record<string, unknown>>>): void;
  resourceType(definition: ResourceTypeDefinition): void;
  searchIndexer(definition: SearchIndexerContribution): void;
  searchQuery(definition: SearchQueryContribution): void;
  view(definition: ViewDefinition): void;
  workspaceStorage(definition: WorkspaceStorageDefinition): void;
}

export interface PluginActivationContext {
  readonly contributions: PluginContributionRegistrar;
  readonly effects: { add(effect: PluginEffect): void };
  readonly plugin: Readonly<{ id: string; version: string }>;
  readonly services: {
    optional<TMethods extends PluginServiceMethods>(
      definition: PluginServiceDefinition<TMethods>
    ): PluginServiceReference<TMethods>;
    provide<TMethods extends PluginServiceMethods>(
      definition: PluginServiceDefinition<TMethods>,
      implementation: TMethods
    ): void;
    require<TMethods extends PluginServiceMethods>(
      definition: PluginServiceDefinition<TMethods>
    ): PluginServiceReference<TMethods>;
  };
  readonly signal: AbortSignal;
  readonly slots: {
    contribute<TMetadata extends object, TInput, TOutput>(
      slot: PluginServiceSlotDefinition<TMetadata, TInput, TOutput>,
      contribution: PluginServiceSlotContribution<TMetadata, TInput, TOutput>
    ): void;
  };
}

export interface PluginDefinition {
  activate(
    context: PluginActivationContext
  ): PluginDisposable | Promise<PluginDisposable | void> | void;
  manifest: PluginManifest;
}

export interface PluginDefinitionInput {
  activate(
    context: PluginActivationContext
  ): PluginDisposable | Promise<PluginDisposable | void> | void;
  manifest: unknown;
}

export interface ActivatedPluginContributions {
  contributions: readonly PluginContribution[];
  locales: Readonly<Record<string, Record<string, unknown>>>;
  serviceProviders: readonly PluginServiceProviderRegistration[];
  slotContributions: readonly PluginServiceSlotRegistration[];
}

export interface PreparedPluginActivation extends ActivatedPluginContributions {
  dispose(): Promise<void>;
  start(): Promise<void>;
}

export interface PluginModule {
  default: PluginDefinition;
}

export interface PluginDescriptor {
  icon: PluginIconSource;
  load: () => Promise<PluginModule>;
  manifest: PluginManifest;
  routes?: readonly PluginSubviewRouteMetadata[];
}

export type PluginDescriptorInput = Omit<PluginDescriptor, "manifest"> & {
  manifest: unknown;
};

export interface PluginSubviewRouteMetadata {
  path: string;
  title: string;
  viewId: string;
}

export interface PluginMetadata {
  description: string;
  developer: string;
  icon: PluginIconSource;
  iconUrl?: string;
  id: string;
  keywords?: readonly string[];
  longDescription?: string;
  name: string;
  subviewRoutes?: readonly PluginSubviewRouteMetadata[];
  version: string;
  website?: string;
}

function assertNamespaced(pluginId: string, id: string): void {
  if (id !== pluginId && !id.startsWith(`${pluginId}.`)) {
    throw new Error(
      `Extension "${pluginId}" contribution "${id}" must use its namespace`
    );
  }
}

function assertTarget(target: ResourceTypeTarget, label: string): void {
  if (!(target.resourceTypeIds?.length || target.schemas?.length)) {
    throw new Error(`${label} must target a resource type or schema`);
  }
  for (const schema of target.schemas ?? []) {
    if (
      (schema.minimumVersion !== undefined && schema.minimumVersion < 1) ||
      (schema.maximumVersion !== undefined && schema.maximumVersion < 1) ||
      (schema.minimumVersion !== undefined &&
        schema.maximumVersion !== undefined &&
        schema.minimumVersion > schema.maximumVersion)
    ) {
      throw new Error(`${label} has an invalid schema version range`);
    }
  }
}

function targetMatchesResourceType(
  target: ResourceTypeTarget,
  resourceType: ResourceTypeDefinition
): boolean {
  const typeMatches =
    !target.resourceTypeIds?.length ||
    target.resourceTypeIds.includes(resourceType.resourceTypeId);
  const schemaMatches =
    !target.schemas?.length ||
    target.schemas.some(
      ({ id, maximumVersion = Number.POSITIVE_INFINITY, minimumVersion = 1 }) =>
        id === resourceType.schema.id &&
        resourceType.schema.currentVersion >= minimumVersion &&
        resourceType.schema.currentVersion <= maximumVersion
    );
  return typeMatches && schemaMatches;
}

function assertResourceType(definition: ResourceTypeDefinition): void {
  const { currentVersion, migrations = [], versions } = definition.schema;
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error(
      `Resource type "${definition.resourceTypeId}" schema version must be positive`
    );
  }
  for (let version = 1; version <= currentVersion; version += 1) {
    if (!versions[version]) {
      throw new Error(
        `Resource type "${definition.resourceTypeId}" has no validator for schema version ${version}`
      );
    }
  }
  const ordered = [...migrations].sort((left, right) => left.from - right.from);
  if (ordered.length !== currentVersion - 1) {
    throw new Error(
      `Resource type "${definition.resourceTypeId}" must define every migration from version 1`
    );
  }
  for (const [index, migration] of ordered.entries()) {
    if (migration.to !== migration.from + 1) {
      throw new Error(
        `Resource type "${definition.resourceTypeId}" migrations must advance one version`
      );
    }
    if (!(versions[migration.from] && versions[migration.to])) {
      throw new Error(
        `Resource type "${definition.resourceTypeId}" migration validator is missing`
      );
    }
    if (migration.from !== index + 1) {
      throw new Error(
        `Resource type "${definition.resourceTypeId}" migrations must be contiguous`
      );
    }
  }
  if (migrations.length && !definition.schema.write) {
    throw new Error(
      `Resource type "${definition.resourceTypeId}" migrations require schema.write`
    );
  }
  if (
    !definition.storage ||
    typeof definition.storage !== "object" ||
    Array.isArray(definition.storage)
  ) {
    throw new Error(
      `Resource type "${definition.resourceTypeId}" storage must be a slot map`
    );
  }
  for (const [name, slot] of Object.entries(definition.storage)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new Error(
        `Resource type "${definition.resourceTypeId}" has invalid storage slot "${name}"`
      );
    }
    if (!slot || typeof slot !== "object" || !isStorageKind(slot.kind)) {
      throw new Error(
        `Resource type "${definition.resourceTypeId}" has invalid storage kind for slot "${name}"`
      );
    }
    if (slot.kind === "file" && "initialize" in slot) {
      throw new Error(
        `File storage slot "${name}" cannot define an initializer`
      );
    }
  }
}

export function defineResourceType(
  definition: ResourceTypeDefinition
): ResourceTypeContribution {
  assertResourceType(definition);
  return { ...definition, type: "resource-type" };
}

export function defineView(definition: ViewDefinition): ViewContribution {
  if (definition.target.kind === "resource") {
    const resourceView = definition as ResourceViewDefinition;
    assertTarget(resourceView.target, `View "${definition.viewId}"`);
    for (const [name, kind] of Object.entries(
      resourceView.storageRequirements
    )) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        throw new Error(
          `View "${definition.viewId}" has invalid storage slot "${name}"`
        );
      }
      if (!isStorageKind(kind)) {
        throw new Error(
          `View "${definition.viewId}" has invalid storage kind for slot "${name}"`
        );
      }
    }
  } else if (definition.statusBar !== undefined) {
    throw new Error(
      `Standalone view "${definition.viewId}" cannot define status-bar content`
    );
  }
  return { ...definition, type: "view" };
}

export function defineWorkspaceStorage(
  definition: WorkspaceStorageDefinition
): WorkspaceStorageContribution {
  if (
    typeof definition.storageId !== "string" ||
    !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/.test(definition.storageId)
  ) {
    throw new Error("Workspace storage has an invalid storage ID");
  }
  if (definition.kind !== "key-value") {
    throw new Error(
      `Workspace storage "${definition.storageId}" must use key-value storage`
    );
  }
  return { ...definition, type: "workspace-storage" };
}

export function getResourceTypeContributions(
  value: ActivatedPluginContributions
): ResourceTypeContribution[] {
  return value.contributions.filter(
    (contribution): contribution is ResourceTypeContribution =>
      contribution.type === "resource-type"
  );
}

export function getViewContributions(
  value: ActivatedPluginContributions
): ViewContribution[] {
  return value.contributions.filter(
    (contribution): contribution is ViewContribution =>
      contribution.type === "view"
  );
}

export function getWorkspaceStorageContributions(
  value: ActivatedPluginContributions
): WorkspaceStorageContribution[] {
  return value.contributions.filter(
    (contribution): contribution is WorkspaceStorageContribution =>
      contribution.type === "workspace-storage"
  );
}

export function getResourceCommandContributions(
  value: ActivatedPluginContributions
): ResourceCommandRegistration[] {
  return value.contributions.filter(
    (contribution): contribution is ResourceCommandRegistration =>
      contribution.type === "resource-command"
  );
}

export function getSearchIndexerContributions(
  value: ActivatedPluginContributions
): SearchIndexerRegistration[] {
  return value.contributions.filter(
    (contribution): contribution is SearchIndexerRegistration =>
      contribution.type === "search-indexer"
  );
}

export function getSearchQueryContributions(
  value: ActivatedPluginContributions
): SearchQueryRegistration[] {
  return value.contributions.filter(
    (contribution): contribution is SearchQueryRegistration =>
      contribution.type === "search-query"
  );
}

function assertDefaultViewsCompatible(
  value: ActivatedPluginContributions
): void {
  const views = new Map(
    getViewContributions(value).map((view) => [view.viewId, view])
  );
  for (const resourceType of getResourceTypeContributions(value)) {
    if (!resourceType.defaultViewId) {
      continue;
    }
    const view = views.get(resourceType.defaultViewId);
    if (view?.target.kind !== "resource") {
      throw new Error(
        `Resource type "${resourceType.resourceTypeId}" default view "${resourceType.defaultViewId}" is not registered`
      );
    }
    if (!targetMatchesResourceType(view.target, resourceType)) {
      throw new Error(
        `Resource type "${resourceType.resourceTypeId}" default view "${resourceType.defaultViewId}" is incompatible`
      );
    }
    const resourceView = view as ResourceViewDefinition;
    for (const [name, kind] of Object.entries(
      resourceView.storageRequirements
    )) {
      if (resourceType.storage[name]?.kind !== kind) {
        throw new Error(
          `Resource type "${resourceType.resourceTypeId}" default view "${resourceType.defaultViewId}" requires ${name}:${kind}`
        );
      }
    }
  }
}

const VIEW_ID_PREFIX = "view:";

export function createViewInstanceId(viewId: string): string {
  return `${VIEW_ID_PREFIX}${viewId}`;
}

export function getViewIdFromInstanceId(
  viewInstanceId: string
): string | undefined {
  return viewInstanceId.startsWith(VIEW_ID_PREFIX)
    ? viewInstanceId.slice(VIEW_ID_PREFIX.length)
    : undefined;
}

export function definePlugin(input: PluginDefinitionInput): PluginDefinition {
  if (typeof input.activate !== "function") {
    throw new Error("Extension activate must be a function");
  }
  return {
    activate: input.activate,
    manifest: validateSupportedManifest(input.manifest),
  };
}

export async function preparePluginActivation(
  plugin: PluginDefinition
): Promise<PreparedPluginActivation> {
  const controller = new AbortController();
  const contributions: PluginContribution[] = [];
  const effects: PluginEffect[] = [];
  const locales: Record<string, Record<string, unknown>> = {};
  const serviceProviders: PluginServiceProviderRegistration[] = [];
  const slotContributions: PluginServiceSlotRegistration[] = [];
  const cleanups: PluginDisposable[] = [];
  const keys = new Set<string>();
  let activationCleanup: PluginDisposable | undefined;
  let acceptingRegistrations = true;
  let started = false;
  let disposed = false;

  const assertRegistrationOpen = (): void => {
    if (!acceptingRegistrations) {
      throw new Error(
        `Extension "${plugin.manifest.id}" registration is already complete`
      );
    }
  };

  const register = <T extends PluginContribution>(
    contribution: T,
    contributionId: string
  ): void => {
    assertRegistrationOpen();
    assertNamespaced(plugin.manifest.id, contributionId);
    const key = `${contribution.type}:${contributionId}`;
    if (keys.has(key)) {
      throw new Error(`Duplicate extension contribution: ${key}`);
    }
    keys.add(key);
    contributions.push(contribution);
  };

  const dependencyRange = (serviceId: string, optional: boolean) => {
    const dependencies = optional
      ? plugin.manifest.optionalDependencies
      : plugin.manifest.dependencies;
    return Object.entries(dependencies)
      .filter(
        ([dependencyId]) =>
          serviceId === dependencyId || serviceId.startsWith(`${dependencyId}.`)
      )
      .sort(([left], [right]) => right.length - left.length)[0]?.[1];
  };

  const referenceService = <TMethods extends PluginServiceMethods>(
    definition: PluginServiceDefinition<TMethods>,
    optional: boolean
  ): PluginServiceReference<TMethods> => {
    assertRegistrationOpen();
    const range = dependencyRange(definition.id, optional);
    if (!range) {
      throw new Error(
        `Extension "${plugin.manifest.id}" has not declared ${optional ? "optional" : "required"} dependency "${definition.id}"`
      );
    }
    if (!satisfies(definition.version, range)) {
      throw new Error(
        `Extension service "${definition.id}" ${definition.version} does not satisfy ${range}`
      );
    }
    return Object.freeze({ definition, optional });
  };

  try {
    const cleanup = await plugin.activate({
      contributions: {
        command: (definition) => {
          assertTarget(definition, `Command "${definition.id}"`);
          register({ ...definition, type: "resource-command" }, definition.id);
        },
        locales: (resources) => {
          assertRegistrationOpen();
          for (const [language, values] of Object.entries(resources)) {
            locales[language] = { ...locales[language], ...values };
          }
        },
        workspaceStorage: (definition) =>
          register(defineWorkspaceStorage(definition), definition.storageId),
        resourceType: (definition) => {
          assertNamespaced(plugin.manifest.id, definition.schema.id);
          register(defineResourceType(definition), definition.resourceTypeId);
        },
        searchIndexer: (definition) => {
          assertTarget(definition, `Search indexer "${definition.id}"`);
          if (typeof definition.extractText !== "function") {
            throw new Error(
              `Search indexer "${definition.id}" requires extractText`
            );
          }
          register({ ...definition, type: "search-indexer" }, definition.id);
        },
        searchQuery: (definition) => {
          if (
            typeof definition.query !== "function" ||
            typeof definition.open !== "function"
          ) {
            throw new Error(
              `Search query provider "${definition.id}" requires query and open`
            );
          }
          register({ ...definition, type: "search-query" }, definition.id);
        },
        view: (definition) =>
          register(defineView(definition), definition.viewId),
      },
      effects: {
        add: (effect) => {
          assertRegistrationOpen();
          effects.push(effect);
        },
      },
      plugin: { id: plugin.manifest.id, version: plugin.manifest.version },
      services: {
        optional: (definition) => referenceService(definition, true),
        provide: (definition, implementation) => {
          assertRegistrationOpen();
          assertNamespaced(plugin.manifest.id, definition.id);
          if (definition.version !== plugin.manifest.version) {
            throw new Error(
              `Extension service "${definition.id}" version must match its provider`
            );
          }
          const key = `service:${definition.id}`;
          if (keys.has(key)) {
            throw new Error(`Duplicate extension contribution: ${key}`);
          }
          for (const method of definition.methods) {
            if (typeof implementation[method] !== "function") {
              throw new Error(
                `Extension service "${definition.id}" is missing method "${method}"`
              );
            }
          }
          keys.add(key);
          serviceProviders.push({
            definition: definition as PluginServiceDefinition,
            implementation,
          });
        },
        require: (definition) => referenceService(definition, false),
      },
      signal: controller.signal,
      slots: {
        contribute: (slot, contribution) => {
          assertRegistrationOpen();
          assertNamespaced(plugin.manifest.id, contribution.id);
          const range =
            dependencyRange(slot.serviceId, false) ??
            dependencyRange(slot.serviceId, true);
          if (!range) {
            throw new Error(
              `Extension "${plugin.manifest.id}" has not declared dependency "${slot.serviceId}"`
            );
          }
          if (!satisfies(slot.serviceVersion, range)) {
            throw new Error(
              `Extension service slot "${slot.serviceId}.${slot.id}" ${slot.serviceVersion} does not satisfy ${range}`
            );
          }
          if (typeof contribution.invoke !== "function") {
            throw new Error(
              `Extension slot contribution "${contribution.id}" requires invoke`
            );
          }
          if (
            !contribution.metadata ||
            typeof contribution.metadata !== "object" ||
            Array.isArray(contribution.metadata) ||
            contribution.metadata instanceof ArrayBuffer
          ) {
            throw new Error(
              `Extension slot contribution "${contribution.id}" metadata must be an object`
            );
          }
          const key = `slot:${slot.serviceId}:${slot.id}:${contribution.id}`;
          if (keys.has(key)) {
            throw new Error(`Duplicate extension contribution: ${key}`);
          }
          keys.add(key);
          slotContributions.push({
            contribution: {
              ...contribution,
              metadata: cloneSandboxWireValue(
                contribution.metadata,
                `Extension slot contribution "${contribution.id}" metadata`
              ) as SandboxWireObject,
            } as unknown as PluginServiceSlotContribution,
            slot: slot as PluginServiceSlotDefinition,
          });
        },
      },
    });
    acceptingRegistrations = false;
    if (cleanup !== undefined && typeof cleanup !== "function") {
      throw new Error(
        `Extension "${plugin.manifest.id}" activate must return a cleanup function`
      );
    }
    if (cleanup) {
      activationCleanup = cleanup;
    }

    assertDefaultViewsCompatible({
      contributions,
      locales,
      serviceProviders,
      slotContributions,
    });
  } catch (error) {
    acceptingRegistrations = false;
    controller.abort();
    try {
      await activationCleanup?.();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Extension activation failed"
      );
    }
    throw error;
  }

  const dispose = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    controller.abort();
    const errors: unknown[] = [];
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await activationCleanup?.();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Extension cleanup failed");
    }
  };

  const start = async () => {
    if (disposed) {
      throw new Error(`Extension "${plugin.manifest.id}" is disposed`);
    }
    if (started) {
      return;
    }
    started = true;
    try {
      for (const effect of effects) {
        const cleanup = await effect(controller.signal);
        if (cleanup !== undefined && typeof cleanup !== "function") {
          throw new Error("Extension effect must return a cleanup function");
        }
        if (cleanup) {
          cleanups.push(cleanup);
        }
      }
    } catch (error) {
      await dispose().catch(() => undefined);
      throw error;
    }
  };

  return {
    contributions,
    dispose,
    locales,
    serviceProviders,
    slotContributions,
    start,
  };
}

function assertSameManifest(
  actual: PluginManifest,
  expected: PluginManifest
): void {
  const fields = [
    "id",
    "version",
    "name",
    "description",
    "longDescription",
    "developer",
    "api",
    "website",
  ] as const;
  for (const field of fields) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `Extension "${actual.id}" runtime ${field} does not match manifest declaration`
      );
    }
  }
  for (const field of [
    "conflicts",
    "dependencies",
    "optionalDependencies",
  ] as const) {
    const normalize = (value: Readonly<Record<string, string>>) =>
      JSON.stringify(
        Object.entries(value).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      );
    if (normalize(actual[field]) !== normalize(expected[field])) {
      throw new Error(
        `Extension "${actual.id}" runtime ${field} does not match manifest declaration`
      );
    }
  }
  if (
    JSON.stringify([...actual.permissions].sort()) !==
    JSON.stringify([...expected.permissions].sort())
  ) {
    throw new Error(
      `Extension "${actual.id}" runtime permissions does not match manifest declaration`
    );
  }
  if (
    JSON.stringify(actual.keywords ?? []) !==
    JSON.stringify(expected.keywords ?? [])
  ) {
    throw new Error(
      `Extension "${actual.id}" runtime keywords does not match manifest declaration`
    );
  }
}

export function assertPluginDefinitionMatchesManifest(
  input: PluginDefinitionInput,
  expectedManifest: unknown
): PluginDefinition {
  const plugin = definePlugin(input);
  assertSameManifest(
    plugin.manifest,
    validateSupportedManifest(expectedManifest)
  );
  return plugin;
}

export function definePluginDescriptor(
  input: PluginDescriptorInput
): PluginDescriptor {
  return { ...input, manifest: validateSupportedManifest(input.manifest) };
}

export function descriptorMetadata(
  descriptor: PluginDescriptor
): PluginMetadata {
  const { manifest, icon, routes } = descriptor;
  return {
    description: manifest.description,
    developer: manifest.developer,
    icon,
    id: manifest.id,
    ...(manifest.keywords && { keywords: manifest.keywords }),
    ...(manifest.longDescription && {
      longDescription: manifest.longDescription,
    }),
    name: manifest.name,
    subviewRoutes: routes,
    version: manifest.version,
    ...(manifest.website && { website: manifest.website }),
  };
}

export async function loadPluginDescriptor(
  descriptor: PluginDescriptor
): Promise<PluginDefinition> {
  const module = await descriptor.load();
  const plugin = definePlugin(module.default);
  assertSameManifest(plugin.manifest, descriptor.manifest);
  return plugin;
}
