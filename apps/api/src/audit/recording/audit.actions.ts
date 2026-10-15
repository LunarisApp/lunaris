import { type AuditInput, defineAuditAction } from "evlog";

type AuditActionFactory = {
  (input: Omit<AuditInput, "action" | "target"> & {
    target?: { id: string; type?: string; [key: string]: unknown };
  }): AuditInput;
  readonly action: string;
  readonly target?: string;
};

function action(
  name: string,
  target: string,
  severity: "low" | "medium" | "high" | "critical",
  requiresChanges = false,
): AuditActionFactory {
  return defineAuditAction(name, {
    target,
    severity,
    requiresChanges,
  }) as AuditActionFactory;
}

export const AuditActions = {
  accountDeletionRequested: action(
    "account.deletion.requested",
    "account",
    "critical",
  ),
  accountCreated: action("account.created", "account", "high"),
  accountDeleted: action("account.deleted", "account", "critical"),
  accountIdentityChanged: action(
    "account.identity.changed",
    "account",
    "critical",
  ),
  accountUpdated: action("account.updated", "account", "medium", true),
  aiChatRequested: action("ai.chat.requested", "organization", "high"),
  auditEventsRead: action("audit-events.read", "organization", "high"),
  avatarUploadConfirmed: action("avatar.upload.confirmed", "user", "medium"),
  avatarUploadUrlIssued: action("avatar.upload-url.issued", "user", "medium"),
  apiKeyChanged: action("api-key.changed", "apiKey", "critical"),
  authPasswordReset: action("auth.password-reset", "account", "critical"),
  authPasswordResetRequested: action(
    "auth.password-reset.requested",
    "account",
    "high",
  ),
  authSignedIn: action("auth.signed-in", "account", "high"),
  authSignedOut: action("auth.signed-out", "account", "medium"),
  authSessionsRevoked: action(
    "auth.sessions.revoked",
    "account",
    "critical",
  ),
  authTwoFactorChanged: action(
    "auth.two-factor.changed",
    "account",
    "critical",
  ),
  authTwoFactorVerified: action(
    "auth.two-factor.verified",
    "account",
    "high",
  ),
  backupCreated: action("backup.created", "organization", "critical"),
  backupDownloadUrlIssued: action(
    "backup.download-url.issued",
    "backup",
    "critical",
  ),
  billingCheckoutCreated: action(
    "billing.checkout.created",
    "organization",
    "high",
  ),
  billingPlanChanged: action("billing.plan.changed", "organization", "critical", true),
  billingPortalOpened: action("billing.portal.opened", "organization", "high"),
  billingSubscriptionSynchronized: action(
    "billing.subscription.synchronized",
    "subscription",
    "critical",
    true,
  ),
  workspaceStorageRead: action("workspace-storage.read", "workspaceStorage", "high"),
  encryptionKeyIssued: action(
    "encryption-key.issued",
    "user",
    "critical",
  ),
  fileDeleted: action("file.deleted", "file", "high"),
  fileDownloadUrlIssued: action(
    "file.download-url.issued",
    "file",
    "medium",
  ),
  fileUploadCreated: action("file.upload.created", "file", "medium"),
  fileUploadResumed: action("file.upload.resumed", "file", "medium"),
  fileUploadPartSigned: action("file.upload.part-signed", "file", "medium"),
  fileUploadCompleted: action("file.upload.completed", "file", "medium"),
  fileUploadCanceled: action("file.upload.canceled", "file", "medium"),
  passkeyChanged: action("passkey.changed", "account", "critical"),
  oauthClientChanged: action("oauth-client.changed", "oauthClient", "critical"),
  oauthConsentChanged: action(
    "oauth-consent.changed",
    "oauthConsent",
    "critical",
  ),
  oauthTokenIssued: action("oauth-token.issued", "account", "high"),
  workspaceCreated: action("workspace.created", "workspace", "medium", true),
  workspaceDeleted: action("workspace.deleted", "workspace", "high"),
  workspaceMemberGranted: action(
    "workspace-member.granted",
    "workspaceMember",
    "high",
    true,
  ),
  workspaceMemberRevoked: action(
    "workspace-member.revoked",
    "workspaceMember",
    "high",
  ),
  workspaceMemberRoleUpdated: action(
    "workspace-member.role.updated",
    "workspaceMember",
    "high",
    true,
  ),
  workspaceOwnershipTransferred: action(
    "workspace.ownership.transferred",
    "workspace",
    "critical",
    true,
  ),
  workspaceResourceCreated: action("workspace-resource.created", "workspaceResource", "medium"),
  workspaceResourceDeleted: action("workspace-resource.deleted", "workspaceResource", "high"),
  workspaceResourceTrashed: action("workspace-resource.trashed", "workspaceResource", "high"),
  workspaceResourceRestored: action("workspace-resource.restored", "workspaceResource", "medium"),
  workspaceResourcePurged: action("workspace-resource.purged", "workspaceResource", "critical"),
  workspaceResourceAutomaticallyPurged: action(
    "workspace-resource.automatically-purged",
    "workspaceResource",
    "high",
  ),
  workspaceResourceUpdated: action("workspace-resource.updated", "workspaceResource", "medium", true),
  workspaceExtensionInstalled: action(
    "workspace-extension.installed",
    "workspaceExtension",
    "critical",
    true,
  ),
  workspaceExtensionUninstalled: action(
    "workspace-extension.uninstalled",
    "workspaceExtension",
    "critical",
    true,
  ),
  workspaceExtensionUpdated: action(
    "workspace-extension.updated",
    "workspaceExtension",
    "critical",
    true,
  ),
  workspaceUpdated: action("workspace.updated", "workspace", "medium", true),
  syncIngested: action("sync.ingested", "organization", "medium"),
  organizationDeletionRestored: action("organization.deletion.restored", "organization", "critical"),
  organizationPurged: action("organization.purged", "organization", "critical"),
  organizationDeletionRequested: action(
    "organization.deletion.requested",
    "organization",
    "critical",
  ),
  organizationCreated: action("organization.created", "organization", "high"),
  organizationExtensionRegistryAdded: action(
    "organization-extension-registry.added",
    "organizationExtensionRegistry",
    "critical",
    true,
  ),
  organizationExtensionRegistryRemoved: action(
    "organization-extension-registry.removed",
    "organizationExtensionRegistry",
    "critical",
    true,
  ),
  organizationInvitationAccepted: action(
    "organization-invitation.accepted",
    "organizationInvitation",
    "high",
  ),
  organizationInvitationRevoked: action(
    "organization-invitation.revoked",
    "organizationInvitation",
    "high",
  ),
  organizationInvitationCreated: action(
    "organization-invitation.created",
    "organization",
    "high",
  ),
  organizationMemberRemoved: action(
    "organization-member.removed",
    "organizationMember",
    "critical",
  ),
  organizationMemberRoleUpdated: action(
    "organization-member.role.updated",
    "organizationMember",
    "critical",
    true,
  ),
  organizationTeamCreated: action(
    "organization-team.created",
    "organization",
    "high",
    true,
  ),
  organizationTeamDeleted: action(
    "organization-team.deleted",
    "organizationTeam",
    "high",
  ),
  organizationTeamMemberAdded: action(
    "organization-team.member-added",
    "organizationTeam",
    "high",
    true,
  ),
  organizationTeamMemberRemoved: action(
    "organization-team.member-removed",
    "organizationTeam",
    "high",
    true,
  ),
  organizationTeamUpdated: action(
    "organization-team.updated",
    "organizationTeam",
    "high",
    true,
  ),
  organizationUpdated: action("organization.updated", "organization", "high", true),
} as const;

export type AuditActionName = keyof typeof AuditActions;

const routeActions: Readonly<Record<string, AuditActionName>> = {
  "AccountDeletionController.requestDeletion": "accountDeletionRequested",
  "AvatarController.confirmUpload": "avatarUploadConfirmed",
  "AvatarController.getUploadUrl": "avatarUploadUrlIssued",
  "BackupController.create": "backupCreated",
  "BackupController.getDownloadUrl": "backupDownloadUrlIssued",
  "BillingController.changePlan": "billingPlanChanged",
  "BillingController.createCheckout": "billingCheckoutCreated",
  "BillingController.createPortal": "billingPortalOpened",
  "EncryptionKeyController.getEncryptionKey": "encryptionKeyIssued",
  "FilesController.deleteFile": "fileDeleted",
  "FilesController.getDownloadUrl": "fileDownloadUrlIssued",
  "FilesController.createUpload": "fileUploadCreated",
  "FilesController.resumeUpload": "fileUploadResumed",
  "FilesController.signPart": "fileUploadPartSigned",
  "FilesController.completeUpload": "fileUploadCompleted",
  "FilesController.cancelUpload": "fileUploadCanceled",
  "WorkspaceResourcesController.create": "workspaceResourceCreated",
  "WorkspaceResourcesController.delete": "workspaceResourceTrashed",
  "WorkspaceResourcesController.restore": "workspaceResourceRestored",
  "WorkspaceResourcesController.purge": "workspaceResourcePurged",
  "WorkspaceResourcesController.update": "workspaceResourceUpdated",
  "WorkspacesController.create": "workspaceCreated",
  "WorkspacesController.delete": "workspaceDeleted",
  "WorkspacesController.update": "workspaceUpdated",
  "WorkspaceMembersController.add": "workspaceMemberGranted",
  "WorkspaceMembersController.remove": "workspaceMemberRevoked",
  "WorkspaceMembersController.transfer": "workspaceOwnershipTransferred",
  "WorkspaceMembersController.update": "workspaceMemberRoleUpdated",
  "SyncController.ingest": "syncIngested",
  "OrganizationDeletionController.restore": "organizationDeletionRestored",
  "OrganizationDeletionController.requestDeletion": "organizationDeletionRequested",
  "AgentControlController.createResource": "workspaceResourceCreated",
  "AgentControlController.createWorkspace": "workspaceCreated",
  "AgentControlController.deleteResource": "workspaceResourceTrashed",
  "AgentControlController.deleteWorkspace": "workspaceDeleted",
  "AgentControlController.getFileDownloadUrl": "fileDownloadUrlIssued",
  "AgentControlController.getYjsStorageJson": "workspaceStorageRead",
  "AgentControlController.getYjsStorageState": "workspaceStorageRead",
  "AgentControlController.listKeyValueStorage": "workspaceStorageRead",
  "AgentControlController.inviteMember": "organizationInvitationCreated",
  "AgentControlController.removeMember": "organizationMemberRemoved",
  "AgentControlController.updateResource": "workspaceResourceUpdated",
  "AgentControlController.updateWorkspace": "workspaceUpdated",
  "AgentControlController.updateOrganization": "organizationUpdated",
};

export function routeAuditAction(
  controllerName: string,
  handlerName: string,
): AuditActionName | undefined {
  return routeActions[`${controllerName}.${handlerName}`];
}

const authRouteActions: ReadonlyArray<{
  action: AuditActionName;
  pattern: RegExp;
}> = [
  { action: "accountCreated", pattern: /\/sign-up\// },
  { action: "accountDeleted", pattern: /\/delete-user(?:\/callback)?$/ },
  {
    action: "accountIdentityChanged",
    pattern: /\/(?:change-email|link-social|unlink-account)$/,
  },
  { action: "accountUpdated", pattern: /\/update-user$/ },
  { action: "authSignedIn", pattern: /\/sign-in\// },
  { action: "authSignedOut", pattern: /\/sign-out$/ },
  {
    action: "authSessionsRevoked",
    pattern: /\/revoke-(?:session|sessions|other-sessions)$/,
  },
  {
    action: "authPasswordResetRequested",
    pattern: /\/request-password-reset$/,
  },
  {
    action: "authPasswordReset",
    pattern: /\/(?:reset|change)-password$/,
  },
  {
    action: "authTwoFactorChanged",
    pattern: /\/two-factor\/(?:enable|disable|generate-backup-codes)$/,
  },
  {
    action: "authTwoFactorVerified",
    pattern: /\/two-factor\/verify-(?:otp|totp|backup-code)$/,
  },
  {
    action: "passkeyChanged",
    pattern: /\/passkey\/(?:verify-registration|delete-passkey|update-passkey)$/,
  },
  {
    action: "authSignedIn",
    pattern: /\/passkey\/verify-authentication$/,
  },
  {
    action: "apiKeyChanged",
    pattern: /\/api-key\/(?:create|delete|update)$/,
  },
  {
    action: "oauthClientChanged",
    pattern:
      /\/(?:admin\/)?oauth2\/(?:create-client|update-client|delete-client|client\/rotate-secret)$/,
  },
  {
    action: "oauthConsentChanged",
    pattern: /\/oauth2\/(?:consent|update-consent|delete-consent)$/,
  },
  {
    action: "oauthTokenIssued",
    pattern: /\/(?:get-access-token|refresh-token)$/,
  },
  { action: "organizationCreated", pattern: /\/organization\/create$/ },
  {
    action: "organizationUpdated",
    pattern: /\/organization\/update$/,
  },
  {
    action: "organizationInvitationCreated",
    pattern: /\/organization\/invite-member$/,
  },
  {
    action: "organizationInvitationAccepted",
    pattern: /\/organization\/accept-invitation$/,
  },
  {
    action: "organizationInvitationRevoked",
    pattern: /\/organization\/(?:cancel|reject)-invitation$/,
  },
  {
    action: "organizationMemberRemoved",
    pattern: /\/organization\/(?:remove-member|leave)$/,
  },
  {
    action: "organizationMemberRoleUpdated",
    pattern: /\/organization\/update-member-role$/,
  },
  {
    action: "organizationTeamCreated",
    pattern: /\/organization\/create-team$/,
  },
  {
    action: "organizationTeamDeleted",
    pattern: /\/organization\/remove-team$/,
  },
  {
    action: "organizationTeamMemberAdded",
    pattern: /\/organization\/add-team-member$/,
  },
  {
    action: "organizationTeamMemberRemoved",
    pattern: /\/organization\/remove-team-member$/,
  },
  {
    action: "organizationTeamUpdated",
    pattern: /\/organization\/update-team$/,
  },
  { action: "billingPortalOpened", pattern: /\/customer\/portal$/ },
];

export function authRouteAuditAction(path: string): AuditActionName | undefined {
  if (!path.includes("/api/auth/")) return undefined;
  return authRouteActions.find(({ pattern }) => pattern.test(path))?.action;
}
