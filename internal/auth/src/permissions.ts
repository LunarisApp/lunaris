import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Organization-scoped actions available to Lunaris roles.
 *
 * Keep user-owned actions (account deletion, avatar changes, sessions) out of
 * this statement: an organization role must never control a user's account.
 */
export const permissionStatement = {
  ...defaultStatements,
  organization: ["read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  team: ["create", "read", "update", "delete"],
  workspace: ["create", "read", "update", "delete"],
  content: ["read", "write", "delete"],
  backup: ["create", "read"],
  billing: ["read", "update"],
  audit: ["read"],
} as const;

export const organizationAccessControl =
  createAccessControl(permissionStatement);

type PermissionStatement = typeof permissionStatement;

export type PermissionResource = keyof PermissionStatement;

export type PermissionAction<Resource extends PermissionResource> =
  PermissionStatement[Resource][number];

export type AppPermission = {
  [Resource in PermissionResource]: {
    [Action in PermissionAction<Resource>]: {
      readonly action: Action;
      readonly resource: Resource;
    };
  }[PermissionAction<Resource>];
}[PermissionResource];

export const ORGANIZATION_ROLE = {
  editor: "editor",
  owner: "owner",
  viewer: "viewer",
} as const;

export type OrganizationRole =
  (typeof ORGANIZATION_ROLE)[keyof typeof ORGANIZATION_ROLE];

type RolePermissions = Partial<{
  [Resource in PermissionResource]: readonly PermissionAction<Resource>[];
}>;

type CompleteRolePermissions = {
  [Resource in PermissionResource]: readonly PermissionAction<Resource>[];
};

export const organizationRolePermissions = {
  editor: {
    content: ["read", "write", "delete"],
    member: ["read"],
    organization: ["read"],
    workspace: ["create", "read", "update", "delete"],
    team: ["read"],
  },
  owner: {
    ac: ["create", "read", "update", "delete"],
    audit: ["read"],
    backup: ["create", "read"],
    billing: ["read", "update"],
    content: ["read", "write", "delete"],
    invitation: ["create", "read", "cancel"],
    member: ["create", "read", "update", "delete"],
    organization: ["read", "update", "delete"],
    workspace: ["create", "read", "update", "delete"],
    team: ["create", "read", "update", "delete"],
  },
  viewer: {
    content: ["read"],
    member: ["read"],
    organization: ["read"],
    workspace: ["read"],
    team: ["read"],
  },
} as const satisfies {
  editor: RolePermissions;
  owner: CompleteRolePermissions;
  viewer: RolePermissions;
};

export const organizationRoles = {
  editor: organizationAccessControl.newRole(organizationRolePermissions.editor),
  owner: organizationAccessControl.newRole(organizationRolePermissions.owner),
  viewer: organizationAccessControl.newRole(organizationRolePermissions.viewer),
};

/**
 * Temporary aliases keep rolling deployments safe while stored legacy roles
 * are migrated to editor/viewer. New assignments accept only standard roles.
 */
export const organizationRolesWithLegacyAliases = {
  ...organizationRoles,
  admin: organizationRoles.editor,
  member: organizationRoles.editor,
};

export function resolveOrganizationRole(value: unknown): OrganizationRole | null {
  const roles =
    typeof value === "string"
      ? value.split(",").map((role) => role.trim())
      : [];
  if (roles.includes(ORGANIZATION_ROLE.owner)) return ORGANIZATION_ROLE.owner;
  if (
    roles.includes(ORGANIZATION_ROLE.editor) ||
    roles.includes("admin") ||
    roles.includes("member")
  )
    return ORGANIZATION_ROLE.editor;
  if (roles.includes(ORGANIZATION_ROLE.viewer)) return ORGANIZATION_ROLE.viewer;
  return null;
}

export function hasOrganizationPermission(
  role: unknown,
  required: AppPermission,
): boolean {
  const roles =
    typeof role === "string"
      ? role
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

  return roles.some((value) => {
    const normalized = resolveOrganizationRole(value);
    if (!normalized) return false;

    const permissions = organizationRolePermissions[normalized] as RolePermissions;
    return (permissions[required.resource] as readonly string[] | undefined)
      ?.includes(required.action) ?? false;
  });
}

type PermissionCatalog = {
  [Resource in PermissionResource]: {
    [Action in PermissionAction<Resource>]: {
      readonly action: Action;
      readonly resource: Resource;
    };
  };
};

function createPermissionCatalog(): PermissionCatalog {
  const catalog: Partial<
    Record<PermissionResource, Record<string, AppPermission>>
  > = {};

  for (const resource of Object.keys(
    permissionStatement,
  ) as PermissionResource[]) {
    const actions = permissionStatement[resource] as readonly string[];
    catalog[resource] = Object.fromEntries(
      actions.map((action) => [action, { action, resource }]),
    ) as Record<string, AppPermission>;
  }

  return catalog as PermissionCatalog;
}

/**
 * Typed permission values for API boundaries.
 *
 * @example `@RequirePermission(permission.workspace.update)`
 */
export const permission = createPermissionCatalog();
