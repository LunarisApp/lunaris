import { APIError } from "better-auth/api";
import { log, parseError } from "evlog";
import { ORGANIZATION_ROLE, type OrganizationRole } from "./permissions";

export const DEFAULT_YJS_RETENTION_DAYS = 7;

const MIN_YJS_RETENTION_DAYS = 1;
const ORGANIZATION_MEMBER_LIMIT_REACHED = "ORGANIZATION_MEMBER_LIMIT_REACHED";
const ORGANIZATION_ROLE_INVALID = "ORGANIZATION_ROLE_INVALID";
const ORGANIZATION_OWNER_ROLE_RESERVED = "ORGANIZATION_OWNER_ROLE_RESERVED";
const ORGANIZATION_TYPE_IMMUTABLE = "ORGANIZATION_TYPE_IMMUTABLE";

export interface OrganizationPlanCallbacks {
  assertCanRemoveMember?: (
    userId: string,
    organizationId: string
  ) => Promise<void>;
  canCreateOwnedOrganization: (userId: string) => Promise<boolean>;
  canManageBilling: (
    userId: string,
    organizationId: string
  ) => Promise<boolean>;
  getMemberLimit: (organizationId: string) => Promise<number>;
  hasMemberCapacity: (
    organizationId: string,
    options: { includePendingInvitations: boolean }
  ) => Promise<boolean>;
  hasMembers: (organizationId: string) => Promise<boolean>;
  syncMemberSeats: (organizationId: string) => Promise<void>;
}

export async function syncOrganizationMemberSeats(
  organizationPlans:
    | Pick<OrganizationPlanCallbacks, "syncMemberSeats">
    | undefined,
  organizationId: string
): Promise<void> {
  if (!organizationPlans) {
    return;
  }
  try {
    await organizationPlans.syncMemberSeats(organizationId);
  } catch (error) {
    log.error({
      args: [
        {
          error: parseError(error),
          organizationId,
        },
      ],
      context: "BetterAuth",
      message:
        "Deferred failed organization seat sync to reconciliation worker",
    });
  }
}

export function applyRetentionDefaults(
  data: Record<string, unknown>,
  mode: "create" | "update"
) {
  const nextData = { ...data };

  if (nextData.yjsRetentionDays === undefined) {
    if (mode === "create") {
      nextData.yjsRetentionDays = DEFAULT_YJS_RETENTION_DAYS;
    }
  } else {
    nextData.yjsRetentionDays = normalizeYjsRetentionDays(
      nextData.yjsRetentionDays
    );
  }

  return nextData;
}

function normalizeYjsRetentionDays(value: unknown) {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : DEFAULT_YJS_RETENTION_DAYS;

  return Math.max(parsed, MIN_YJS_RETENTION_DAYS);
}

export function assertOrganizationIsJoinable(
  organization: Record<string, unknown>
) {
  if (organization.isPersonal) {
    throw new APIError("BAD_REQUEST", {
      message: "Cannot add members to a personal organization",
    });
  }
}

export function assertOrganizationMemberCapacity(hasCapacity: boolean) {
  if (!hasCapacity) {
    throw new APIError("FORBIDDEN", {
      code: ORGANIZATION_MEMBER_LIMIT_REACHED,
      message: "Organization member limit reached.",
    });
  }
}

function organizationRoles(role: unknown): string[] {
  const values = Array.isArray(role)
    ? role
    : typeof role === "string"
      ? [role]
      : [];
  return values.flatMap((value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  );
}

export function hasOrganizationRole(role: unknown, expected: string): boolean {
  return organizationRoles(role).includes(expected);
}

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return (
    value === ORGANIZATION_ROLE.owner ||
    value === ORGANIZATION_ROLE.editor ||
    value === ORGANIZATION_ROLE.viewer
  );
}

function assertStandardOrganizationRole(role: unknown): OrganizationRole {
  const roles = organizationRoles(role);
  if (roles.length === 1 && isOrganizationRole(roles[0])) {
    return roles[0];
  }
  throw new APIError("BAD_REQUEST", {
    code: ORGANIZATION_ROLE_INVALID,
    message: "Organization role must be owner, editor, or viewer.",
  });
}

export function assertOrganizationTypeImmutable(
  update: Record<string, unknown>
): void {
  if (!Object.hasOwn(update, "isPersonal")) {
    return;
  }
  throw new APIError("BAD_REQUEST", {
    code: ORGANIZATION_TYPE_IMMUTABLE,
    message: "Organization type cannot be changed.",
  });
}

export function assertCanAddOrganizationRole(
  role: unknown,
  organizationHasMembers: boolean
): void {
  const nextRole = assertStandardOrganizationRole(role);
  if (nextRole !== ORGANIZATION_ROLE.owner) {
    return;
  }
  if (!organizationHasMembers) {
    return;
  }
  throw new APIError("BAD_REQUEST", {
    code: ORGANIZATION_OWNER_ROLE_RESERVED,
    message: "Organization owner role cannot be added.",
  });
}

export function assertCanUpdateOrganizationRole(
  currentRole: unknown,
  nextRole: unknown
): void {
  const currentIsOwner = hasOrganizationRole(currentRole, "owner");
  const next = assertStandardOrganizationRole(nextRole);
  if (!currentIsOwner && next !== ORGANIZATION_ROLE.owner) {
    return;
  }
  if (currentIsOwner && next === ORGANIZATION_ROLE.owner) {
    return;
  }
  throw new APIError("BAD_REQUEST", {
    code: ORGANIZATION_OWNER_ROLE_RESERVED,
    message: "Organization owner role cannot be added.",
  });
}

export function assertCanRemoveOrganizationMember(role: unknown): void {
  if (!hasOrganizationRole(role, "owner")) {
    return;
  }
  throw new APIError("BAD_REQUEST", {
    code: ORGANIZATION_OWNER_ROLE_RESERVED,
    message: "Organization owner cannot be removed.",
  });
}

export async function assertCanAcceptOrganizationInvitation({
  organization,
  organizationPlans,
}: {
  organization: Record<string, unknown> & { id?: string };
  organizationPlans?: OrganizationPlanCallbacks;
}) {
  assertOrganizationIsJoinable(organization);
  if (!(organizationPlans && organization.id)) {
    return;
  }
  assertOrganizationMemberCapacity(
    await organizationPlans.hasMemberCapacity(organization.id, {
      includePendingInvitations: false,
    })
  );
}
