import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ReactNode } from "react";
import type { Doc } from "yjs";

import type { IconSvgObject, PluginIconSource } from "./constants";
import type { PluginResourceReadContext } from "./resource-data";
import type { JsonObject, JsonValue } from "./json";
import type {
  PluginFetch,
  PluginStoredFileMetadata,
} from "./runtime-context";

export type ResourceStorageKind = "file" | "key-value" | "yjs";

interface ResourceStorageHandleBase {
  /** Opaque host-issued identifier. Extensions must not construct handles. */
  storageId: string;
}

export type ResourceStorageHandle =
  | (ResourceStorageHandleBase & { kind: "file" })
  | (ResourceStorageHandleBase & { kind: "key-value" })
  | (ResourceStorageHandleBase & { kind: "yjs" });

export type ResourceStorageHandles = Readonly<
  Record<string, ResourceStorageHandle>
>;

export interface ResourceEnvelope {
  parentId: string | null;
  resourceId: string;
  resourceTypeId: string;
  schemaId: string;
  schemaVersion: number;
}

export interface ResourceCreateResult {
  name: string;
  resourceId: string;
  storage: ResourceStorageHandles;
}

export interface ResourceCreationContext {
  createResource: (input?: {
    initialPayload?: JsonObject;
    name?: string;
  }) => Promise<ResourceCreateResult>;
  deleteResource: (resourceId: string) => Promise<void>;
  parentId: string;
  uploadFile: (input: {
    file: File;
    storage: ResourceStorageHandle;
  }) => Promise<PluginStoredFileMetadata>;
}

export interface ResourceInitializeContext {
  createdAt: string;
  initialPayload?: JsonObject;
  parentId: string | null;
  resourceId: string;
  userId: string | null;
}

export type ResourcePayloadStorage =
  | {
      kind: "file";
      metadata: PluginStoredFileMetadata | null;
    }
  | {
      kind: "key-value";
      values: Record<string, JsonValue>;
    }
  | {
      document: Doc;
      kind: "yjs";
    };

export interface ResourcePayloadContext {
  resourceId: string;
  storage: Readonly<Record<string, ResourcePayloadStorage>>;
}

export interface ResourceMigration {
  from: number;
  migrate: (payload: unknown) => Promise<unknown> | unknown;
  to: number;
}

export interface ResourceSchemaDefinition {
  /** Current positive integer schema version. */
  currentVersion: number;
  /** Globally unique logical payload schema identifier. */
  id: string;
  /** Pure, contiguous migrations. Each migration advances exactly one version. */
  migrations?: readonly ResourceMigration[];
  /** Reads logical payload from resource storage for validation or migration. */
  read: (context: ResourcePayloadContext) => Promise<unknown> | unknown;
  /** Validators for current and every supported historical version. */
  versions: Readonly<Record<number, StandardSchemaV1>>;
  /** Writes a staged, validated payload back to storage. Required when migrations exist. */
  write?: (
    payload: unknown,
    context: ResourcePayloadContext,
  ) => Promise<void> | void;
}

export type ResourceStorageSlotDefinition =
  | { kind: "file" }
  | {
      initialize?: (
        context: ResourceInitializeContext,
      ) => Promise<JsonObject> | JsonObject;
      kind: "key-value";
    }
  | {
      initialize?: (
        document: Doc,
        context: ResourceInitializeContext,
      ) => Promise<void> | void;
      kind: "yjs";
    };

export type ResourceStorageDefinition = Readonly<
  Record<string, ResourceStorageSlotDefinition>
>;

export interface ResourceHierarchyDefinition {
  /** Whether generic Create menus expose this resource. Defaults to true. */
  userCreatable?: boolean;
  /** Whether resource appears in normal hierarchy. Defaults to true. */
  visible?: boolean;
}

/** Registered durable resource type. Contains persistence only; UI belongs to views. */
export interface ResourceTypeDefinition {
  createInWorkspace?: (
    context: ResourceCreationContext,
  ) => Promise<ResourceCreateResult | null>;
  /** Explicit default resource-targeted view. Omit for non-openable resources. */
  defaultViewId?: string;
  hierarchy?: ResourceHierarchyDefinition;
  icon: PluginIconSource;
  name: string;
  resourceTypeId: string;
  schema: ResourceSchemaDefinition;
  storage: ResourceStorageDefinition;
}

export interface WorkspaceStorageDefinition {
  kind: "key-value";
  /** Immutable, extension-namespaced storage identifier. */
  storageId: string;
}

export interface ResourceTypeTarget {
  resourceTypeIds?: readonly string[];
  schemas?: readonly {
    id: string;
    maximumVersion?: number;
    minimumVersion?: number;
  }[];
}

export interface StandaloneViewTarget {
  kind: "standalone";
  launcher?: { defaultPlacement?: ViewPlacement };
}

export interface ResourceViewTarget extends ResourceTypeTarget {
  kind: "resource";
}

export type ViewTarget = ResourceViewTarget | StandaloneViewTarget;

export interface StandaloneViewProps {
  params: Record<string, unknown>;
  resource?: never;
}

export type ResourceViewStorage = ResourceStorageHandles;

export interface ResourceViewStatusProps {
  params: Record<string, unknown>;
  resource: ResourceEnvelope;
  storage: ResourceViewStorage;
}

export interface ResourceViewProps extends ResourceViewStatusProps {
  /** Host panel visibility; browser visibility is additionally checked by presence. */
  isVisible?: boolean;
  reportReady?: () => void;
}

export type ViewRendererProps = ResourceViewProps | StandaloneViewProps;
export type ViewPlacement = "primary" | "secondary";

interface ViewDefinitionBase {
  icon: PluginIconSource;
  name: string;
  preload?: () => Promise<void>;
  rendererSandbox?: "local-srcdoc";
  viewId: string;
}

export interface StandaloneViewDefinition extends ViewDefinitionBase {
  renderer: (props: StandaloneViewProps) => ReactNode;
  statusBar?: never;
  target: StandaloneViewTarget;
}

export interface ResourceViewDefinition extends ViewDefinitionBase {
  renderer: (props: ResourceViewProps) => ReactNode;
  /** Optional status-bar content shown only while this view is active. */
  statusBar?: (props: ResourceViewStatusProps) => ReactNode;
  /** Named storage slots required from every matching resource type. */
  storageRequirements: Readonly<Record<string, ResourceStorageKind>>;
  target: ResourceViewTarget;
}

export type ViewDefinition = ResourceViewDefinition | StandaloneViewDefinition;

export interface OpenViewInput {
  params?: JsonObject;
  titleKey: string;
  viewId: string;
}

export interface ResourceCommandContext {
  downloadFile: (storage: ResourceStorageHandle) => Promise<boolean>;
  openView: (input: OpenViewInput) => void;
  resourceId: string;
  resourceName: string;
  resourceReadContext: PluginResourceReadContext;
  resourceTypeId: string;
  storage: ResourceStorageHandles;
  waitForYjsPersistence: (storage: ResourceStorageHandle) => Promise<void>;
}

interface ResourceCommandBase {
  group?: number;
  id: string;
  labelKey: string;
}

export interface ResourceCommand extends ResourceCommandBase {
  children?: never;
  icon?: IconSvgObject;
  iconElement?: ReactNode;
  onExecute: (context: ResourceCommandContext) => Promise<void> | void;
  variant?: "destructive";
}

export interface ResourceCommandGroup extends ResourceCommandBase {
  children: ResourceCommand[];
  icon: IconSvgObject;
  onExecute?: never;
  variant?: never;
}

export type ResourceCommandItem = ResourceCommand | ResourceCommandGroup;

export interface ResourceCommandContribution extends ResourceTypeTarget {
  commands: readonly ResourceCommandItem[];
  id: string;
}

export interface SearchIndexFile {
  bytes: ArrayBuffer;
  mediaType: string | null;
}

export interface SearchIndexerContext {
  /** Reads file storage for the indexed resource. Requires `files.read`. */
  readFile(storage: ResourceStorageHandle): Promise<SearchIndexFile | null>;
}

export interface SearchIndexerInput {
  payload: unknown;
  resource: ResourceEnvelope;
  storage: ResourceStorageHandles;
}

/** Extracts searchable plain text from compatible resources. */
export interface SearchIndexerContribution extends ResourceTypeTarget {
  extractText(
    input: SearchIndexerInput,
    context: SearchIndexerContext,
  ): Promise<string | null> | string | null;
  id: string;
}

export interface SearchQueryInput {
  cursor?: string;
  limit: number;
  text: string;
}

export interface SearchQueryResult {
  description?: string;
  icon?: PluginIconSource;
  id: string;
  label: string;
  payload?: JsonObject;
}

export interface SearchQueryPage {
  items: SearchQueryResult[];
  nextCursor: string | null;
}

export interface SearchQueryContext {
  /** Permission-scoped HTTPS transport. Requires `network.https`. */
  fetch: PluginFetch;
}

export interface SearchQueryOpenContext {
  openView(input: OpenViewInput): void;
}

/** Federated search provider contract. Search UI consumption is host-defined. */
export interface SearchQueryContribution {
  id: string;
  open(
    result: SearchQueryResult,
    context: SearchQueryOpenContext,
  ): Promise<void> | void;
  query(
    input: SearchQueryInput,
    context: SearchQueryContext,
  ): Promise<SearchQueryPage>;
}
