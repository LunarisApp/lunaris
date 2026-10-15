import { AttachmentTable, Schema } from "@powersync/common";
import type { CreateSchemaTableProps } from "../core/utils";
import {
  AGENT_ACTION_PREVIEWS_TABLE,
  AGENT_IDEMPOTENCY_TABLE,
  createAgentActionPreviewsTable,
  createAgentIdempotencyTable,
} from "./agent-content/table";
import { createPreferenceTable } from "./preferences/table";
import {
  createWorkspaceExtensionsTable,
  LOCAL_WORKSPACE_EXTENSIONS_TABLE,
} from "./workspace-extensions/table";
import {
  createWorkspaceResourcesTable,
  LOCAL_WORKSPACE_RESOURCES_TABLE,
} from "./workspace-resources/table";
import {
  createWorkspaceResourceTrashTable,
  LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE,
  WORKSPACE_RESOURCE_TRASH_TABLE,
} from "./workspace-resources/trash-table";
import {
  createWorkspaceStorageSlotsTable,
  createWorkspaceStorageValuesTable,
  LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE,
  LOCAL_WORKSPACE_STORAGE_VALUES_TABLE,
} from "./workspace-storage-slots/table";
import { createWorkspaceMemberTable } from "./workspace-members/table";
import { createWorkspaceTable, LOCAL_WORKSPACES_TABLE } from "./workspaces/table";
import {
  createMemberTable,
  createOrganizationTable,
  createUserTable,
  createOrganizationTeamMemberTable,
  createOrganizationTeamTable,
} from "./organizations/table";
import {
  createOrganizationExtensionRegistriesTable,
  ORGANIZATION_EXTENSION_REGISTRIES_TABLE,
} from "./organization-extension-registries/table";
import {
  createYjsDocumentTable,
  createYjsDocumentUpdateTable,
  LOCAL_YJS_DOCUMENT_UPDATES_TABLE,
  LOCAL_YJS_DOCUMENTS_TABLE,
} from "./yjs/table";

export const createAppSchema = (props: CreateSchemaTableProps = {}) =>
  new Schema({
    [AGENT_IDEMPOTENCY_TABLE]: createAgentIdempotencyTable(),
    [AGENT_ACTION_PREVIEWS_TABLE]: createAgentActionPreviewsTable(),
    organization: createOrganizationTable(),
    member: createMemberTable(),
    team: createOrganizationTeamTable(),
    team_member: createOrganizationTeamMemberTable(),
    [ORGANIZATION_EXTENSION_REGISTRIES_TABLE]:
      createOrganizationExtensionRegistriesTable(),
    user: createUserTable(),
    preferences: createPreferenceTable(props),
    attachments: new AttachmentTable(),
    workspaces: createWorkspaceTable(props),
    workspace_members: createWorkspaceMemberTable(),
    [LOCAL_WORKSPACES_TABLE]: createWorkspaceTable({
      localOnly: true,
      viewName: LOCAL_WORKSPACES_TABLE,
    }),
    workspace_extensions: createWorkspaceExtensionsTable(props),
    [LOCAL_WORKSPACE_EXTENSIONS_TABLE]: createWorkspaceExtensionsTable({
      localOnly: true,
      viewName: LOCAL_WORKSPACE_EXTENSIONS_TABLE,
    }),
    workspace_resources: createWorkspaceResourcesTable(props),
    [LOCAL_WORKSPACE_RESOURCES_TABLE]: createWorkspaceResourcesTable({
      localOnly: true,
      viewName: LOCAL_WORKSPACE_RESOURCES_TABLE,
    }),
    [WORKSPACE_RESOURCE_TRASH_TABLE]: createWorkspaceResourceTrashTable(props),
    [LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE]: createWorkspaceResourceTrashTable({
      localOnly: true,
      viewName: LOCAL_WORKSPACE_RESOURCE_TRASH_TABLE,
    }),
    workspace_storage_slots: createWorkspaceStorageSlotsTable(props),
    [LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE]: createWorkspaceStorageSlotsTable({
      localOnly: true,
      viewName: LOCAL_WORKSPACE_STORAGE_SLOTS_TABLE,
    }),
    workspace_storage_values: createWorkspaceStorageValuesTable(props),
    [LOCAL_WORKSPACE_STORAGE_VALUES_TABLE]: createWorkspaceStorageValuesTable({
      localOnly: true,
      viewName: LOCAL_WORKSPACE_STORAGE_VALUES_TABLE,
    }),
    yjs_documents: createYjsDocumentTable(props),
    [LOCAL_YJS_DOCUMENTS_TABLE]: createYjsDocumentTable({
      localOnly: true,
      viewName: LOCAL_YJS_DOCUMENTS_TABLE,
    }),
    yjs_document_updates: createYjsDocumentUpdateTable(props),
    [LOCAL_YJS_DOCUMENT_UPDATES_TABLE]: createYjsDocumentUpdateTable({
      localOnly: true,
      viewName: LOCAL_YJS_DOCUMENT_UPDATES_TABLE,
    }),
  });
