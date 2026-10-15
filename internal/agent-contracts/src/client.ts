import type {
  ActionPreview,
  CreateWorkspaceInput,
  CreateWorkspaceResourceInput,
  InviteOrganizationMemberInput,
  Page,
  PaginationInput,
  Workspace,
  KeyValueStorage,
  WorkspaceResource,
  WorkspaceResourceFilters,
  WorkspaceResourceSearchInput,
  WorkspaceResourceSearchResult,
  ReadConsistency,
  UpdateWorkspaceInput,
  UpdateWorkspaceResourceInput,
  UpdateOrganizationInput,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  YjsStorageJson,
  YjsStorageState,
} from "./schemas";

export interface ContentRequestOptions {
  consistency?: ReadConsistency;
  signal?: AbortSignal;
}

export interface LunarisContentClient {
  getWorkspace(
    organizationId: string,
    workspaceId: string,
    options?: ContentRequestOptions,
  ): Promise<Workspace>;
  getWorkspaceResource(
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    options?: ContentRequestOptions,
  ): Promise<WorkspaceResource>;
  getYjsStorageJson(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    options?: ContentRequestOptions,
  ): Promise<YjsStorageJson>;
  listWorkspaceResources(
    organizationId: string,
    workspaceId: string,
    input?: WorkspaceResourceFilters,
    options?: ContentRequestOptions,
  ): Promise<Page<WorkspaceResource>>;
  listWorkspaces(
    organizationId: string,
    input?: PaginationInput,
    options?: ContentRequestOptions,
  ): Promise<Page<Workspace>>;
  searchResources(
    organizationId: string,
    input: WorkspaceResourceSearchInput,
    options?: ContentRequestOptions,
  ): Promise<Page<WorkspaceResourceSearchResult>>;
}

export interface RequestOptions extends ContentRequestOptions {
  idempotencyKey?: string;
}

export interface WorkspaceResourceDeletionOptions extends RequestOptions {
  expectedResourceTypeId?: string;
}

export interface WorkspaceResourceCreationOptions extends RequestOptions {
  expectedParentResourceTypeId?: string;
}

export type PendingContentTable =
  | "workspace_resources"
  | "workspace_storage_slots"
  | "workspace_storage_values"
  | "workspaces";

export interface PendingContentChanges {
  complete: boolean;
  deletes: Partial<Record<PendingContentTable, string[]>>;
  storageIds: string[];
  upserts: Partial<Record<PendingContentTable, string[]>>;
}

export interface LunarisControlClient extends LunarisContentClient {
  createWorkspace(
    organizationId: string,
    input: CreateWorkspaceInput,
    options?: RequestOptions,
  ): Promise<Workspace>;
  createWorkspaceResource(
    organizationId: string,
    workspaceId: string,
    input: CreateWorkspaceResourceInput,
    options?: WorkspaceResourceCreationOptions,
  ): Promise<WorkspaceResource>;
  deleteWorkspace(
    organizationId: string,
    workspaceId: string,
    previewToken: string,
    options?: RequestOptions,
  ): Promise<{ id: string }>;
  deleteWorkspaceResource(
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    previewToken: string,
    options?: WorkspaceResourceDeletionOptions,
  ): Promise<{ id: string }>;
  executePluginOperation(
    organizationId: string,
    workspaceId: string,
    pluginId: string,
    operation: string,
    input: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<unknown>;
  getFileDownloadUrl(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    options?: RequestOptions,
  ): Promise<{ downloadUrl: string }>;
  getOrganization(
    organizationId: string,
    options?: RequestOptions,
  ): Promise<Organization>;
  getYjsStorageState(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    stateVectorB64?: string,
    options?: RequestOptions,
  ): Promise<YjsStorageState>;
  inviteOrganizationMember(
    organizationId: string,
    input: InviteOrganizationMemberInput,
    options?: RequestOptions,
  ): Promise<OrganizationInvitation>;
  listKeyValueStorage(
    organizationId: string,
    workspaceId: string,
    storageId: string,
    options?: RequestOptions,
  ): Promise<KeyValueStorage>;
  listOrganizationMembers(
    organizationId: string,
    input?: PaginationInput,
    options?: RequestOptions,
  ): Promise<Page<OrganizationMember>>;
  listOrganizations(
    input?: PaginationInput,
    options?: RequestOptions,
  ): Promise<Page<Organization>>;
  previewDeleteWorkspace(
    organizationId: string,
    workspaceId: string,
    options?: RequestOptions,
  ): Promise<ActionPreview>;
  previewDeleteWorkspaceResource(
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    options?: WorkspaceResourceDeletionOptions,
  ): Promise<ActionPreview>;
  previewRemoveOrganizationMember(
    organizationId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<ActionPreview>;
  removeOrganizationMember(
    organizationId: string,
    memberId: string,
    previewToken: string,
    options?: RequestOptions,
  ): Promise<{ id: string }>;
  updateOrganization(
    organizationId: string,
    input: UpdateOrganizationInput,
    options?: RequestOptions,
  ): Promise<Organization>;
  updateWorkspace(
    organizationId: string,
    workspaceId: string,
    input: UpdateWorkspaceInput,
    options?: RequestOptions,
  ): Promise<Workspace>;
  updateWorkspaceResource(
    organizationId: string,
    workspaceId: string,
    resourceId: string,
    input: UpdateWorkspaceResourceInput,
    options?: RequestOptions,
  ): Promise<WorkspaceResource>;
}

export interface PendingAwareControlClient extends LunarisControlClient {
  pendingContentChanges?(): Promise<PendingContentChanges>;
}
