import { describe, expect, it } from "bun:test";
import {
  AuditActions,
  authRouteAuditAction,
  routeAuditAction,
} from "./audit.actions";

describe("audit action catalog", () => {
  it("uses lowercase dot-delimited action names", () => {
    for (const entry of Object.values(AuditActions)) {
      expect(entry.action).toMatch(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
    }
  });

  it.each([
    ["WorkspacesController", "create", "workspaceCreated"],
    ["WorkspacesController", "update", "workspaceUpdated"],
    ["WorkspacesController", "delete", "workspaceDeleted"],
    ["WorkspaceMembersController", "add", "workspaceMemberGranted"],
    ["WorkspaceMembersController", "update", "workspaceMemberRoleUpdated"],
    ["WorkspaceMembersController", "remove", "workspaceMemberRevoked"],
    [
      "WorkspaceMembersController",
      "transfer",
      "workspaceOwnershipTransferred",
    ],
    ["WorkspaceResourcesController", "create", "workspaceResourceCreated"],
    ["WorkspaceResourcesController", "update", "workspaceResourceUpdated"],
    ["WorkspaceResourcesController", "delete", "workspaceResourceTrashed"],
    ["WorkspaceResourcesController", "restore", "workspaceResourceRestored"],
    ["WorkspaceResourcesController", "purge", "workspaceResourcePurged"],
    ["FilesController", "createUpload", "fileUploadCreated"],
    ["FilesController", "getDownloadUrl", "fileDownloadUrlIssued"],
    ["FilesController", "deleteFile", "fileDeleted"],
    ["BackupController", "create", "backupCreated"],
    ["BackupController", "getDownloadUrl", "backupDownloadUrlIssued"],
    ["BillingController", "createCheckout", "billingCheckoutCreated"],
    ["BillingController", "createPortal", "billingPortalOpened"],
    ["BillingController", "changePlan", "billingPlanChanged"],
    ["AccountDeletionController", "requestDeletion", "accountDeletionRequested"],
    [
      "OrganizationDeletionController",
      "requestDeletion",
      "organizationDeletionRequested",
    ],
    ["EncryptionKeyController", "getEncryptionKey", "encryptionKeyIssued"],
    ["AgentControlController", "removeMember", "organizationMemberRemoved"],
    ["AgentControlController", "createResource", "workspaceResourceCreated"],
    ["AgentControlController", "updateResource", "workspaceResourceUpdated"],
    ["AgentControlController", "deleteResource", "workspaceResourceTrashed"],
    ["AgentControlController", "getYjsStorageJson", "workspaceStorageRead"],
    ["AgentControlController", "getYjsStorageState", "workspaceStorageRead"],
    ["AgentControlController", "listKeyValueStorage", "workspaceStorageRead"],
  ] as const)(
    "maps %s.%s to %s",
    (controller, handler, expected) => {
      expect(routeAuditAction(controller, handler)).toBe(expected);
    },
  );

  it.each([
    ["/api/auth/sign-in/email", "authSignedIn"],
    ["/api/auth/two-factor/enable", "authTwoFactorChanged"],
    ["/api/auth/two-factor/verify-totp", "authTwoFactorVerified"],
    ["/api/auth/request-password-reset", "authPasswordResetRequested"],
    ["/api/auth/api-key/delete", "apiKeyChanged"],
    ["/api/auth/organization/remove-member", "organizationMemberRemoved"],
    ["/api/auth/organization/create-team", "organizationTeamCreated"],
    ["/api/auth/organization/update-team", "organizationTeamUpdated"],
    ["/api/auth/organization/remove-team", "organizationTeamDeleted"],
    [
      "/api/auth/organization/add-team-member",
      "organizationTeamMemberAdded",
    ],
    [
      "/api/auth/organization/remove-team-member",
      "organizationTeamMemberRemoved",
    ],
    ["/api/auth/customer/portal", "billingPortalOpened"],
  ] as const)("maps auth route %s to %s", (path, expected) => {
    expect(authRouteAuditAction(path)).toBe(expected);
  });
});
