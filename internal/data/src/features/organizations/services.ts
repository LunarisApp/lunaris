import {
  type AdditionalOptions,
  type QuerySyncStreamOptions,
  useQuery,
} from "@powersync/react";
import {
  resolveOrganizationRole,
  ORGANIZATION_ROLE,
  type OrganizationRole,
} from "@repo/auth/permissions";
import {
  MEMBERS_TABLE,
  ORGANIZATIONS_TABLE,
  type OrganizationEntity,
  USERS_TABLE,
} from "./table";

export const ORGANIZATION_INDEX_SYNC_STREAMS: QuerySyncStreamOptions[] = [
  { name: "organization_index", waitForStream: true },
];

export const ORGANIZATION_DIRECTORY_SYNC_STREAMS: QuerySyncStreamOptions[] = [
  { name: "organization_directory", waitForStream: true },
];

export type { OrganizationRole } from "@repo/auth/permissions";

export interface OrganizationMember {
  createdAt: string;
  id: string;
  organizationId: string;
  role: OrganizationRole;
  user: {
    email: string;
    id: string;
    image: string | null;
    name: string;
  };
}

interface OrganizationMemberRow {
  created_at: string;
  email: string;
  id: string;
  image: string | null;
  name: string;
  organization_id: string;
  role: string;
  user_id: string;
}

interface OrganizationMemberRoleRow {
  role: string;
}

const INDEX_OPTIONS: AdditionalOptions = {
  streams: ORGANIZATION_INDEX_SYNC_STREAMS,
};

const DIRECTORY_OPTIONS: AdditionalOptions = {
  streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS,
};

export function useOrganizationsQuery(
  options: AdditionalOptions = INDEX_OPTIONS
) {
  return useQuery<OrganizationEntity>(
    `SELECT * FROM ${ORGANIZATIONS_TABLE}
     ORDER BY created_at ASC, id ASC`,
    [],
    options
  );
}

export function useOrganizationMembersQuery(
  organizationId: string | undefined,
  options: AdditionalOptions = DIRECTORY_OPTIONS
) {
  const query = useQuery<OrganizationMemberRow>(
    `SELECT
       member.id,
       member.organization_id,
       member.user_id,
       member.role,
       member.created_at,
       user.name,
       user.email,
       user.image
     FROM ${MEMBERS_TABLE} member
     INNER JOIN "${USERS_TABLE}" user ON user.id = member.user_id
     WHERE member.organization_id = ?
     ORDER BY member.id ASC`,
    [organizationId ?? ""],
    options
  );

  return {
    ...query,
    data: query.data?.map(
      (row): OrganizationMember => ({
        createdAt: row.created_at,
        id: row.id,
        organizationId: row.organization_id,
        role: resolveOrganizationRole(row.role) ?? ORGANIZATION_ROLE.viewer,
        user: {
          email: row.email,
          id: row.user_id,
          image: row.image,
          name: row.name,
        },
      })
    ),
  };
}

export function useOrganizationMemberRoleQuery(
  organizationId: string | undefined,
  userId: string | undefined,
  options: AdditionalOptions = INDEX_OPTIONS
) {
  const query = useQuery<OrganizationMemberRoleRow>(
    `SELECT role
     FROM ${MEMBERS_TABLE}
     WHERE organization_id = ? AND user_id = ?
     ORDER BY id ASC
     LIMIT 1`,
    [organizationId ?? "", userId ?? ""],
    options
  );

  return {
    ...query,
    data: resolveOrganizationRole(query.data?.[0]?.role),
  };
}
