import { type AdditionalOptions, useQuery } from "@powersync/react";
import {
  ORGANIZATION_DIRECTORY_SYNC_STREAMS,
  TEAMS_TABLE,
  TEAM_MEMBERS_TABLE,
} from "@repo/data/features/organizations";
export interface OrganizationTeam {
  createdAt: string;
  id: string;
  name: string;
  organizationId: string;
  updatedAt: string | null;
}

export interface OrganizationTeamMembership {
  createdAt: string | null;
  id: string;
  teamId: string;
  userId: string;
}

interface OrganizationTeamRow {
  created_at: string;
  id: string;
  name: string;
  organization_id: string;
  updated_at: string | null;
}

interface OrganizationTeamMembershipRow {
  created_at: string | null;
  id: string;
  team_id: string;
  user_id: string;
}

const DIRECTORY_OPTIONS: AdditionalOptions = {
  streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS,
};

export function useOrganizationTeamsQuery(
  organizationId: string | undefined,
  options: AdditionalOptions = DIRECTORY_OPTIONS
) {
  const query = useQuery<OrganizationTeamRow>(
    `SELECT id, name, organization_id, created_at, updated_at
     FROM ${TEAMS_TABLE}
     WHERE organization_id = ?
     ORDER BY created_at ASC, id ASC`,
    [organizationId ?? ""],
    options
  );

  return {
    ...query,
    data: query.data?.map(
      (row): OrganizationTeam => ({
        createdAt: row.created_at,
        id: row.id,
        name: row.name,
        organizationId: row.organization_id,
        updatedAt: row.updated_at,
      })
    ),
  };
}

export function useOrganizationTeamMembershipsQuery(
  organizationId: string | undefined,
  options: AdditionalOptions = DIRECTORY_OPTIONS
) {
  const query = useQuery<OrganizationTeamMembershipRow>(
    `SELECT team_member.id, team_member.team_id, team_member.user_id,
            team_member.created_at
     FROM ${TEAM_MEMBERS_TABLE} team_member
     INNER JOIN ${TEAMS_TABLE} team ON team.id = team_member.team_id
     WHERE team.organization_id = ?
     ORDER BY team_member.id ASC`,
    [organizationId ?? ""],
    options
  );

  return {
    ...query,
    data: query.data?.map(
      (row): OrganizationTeamMembership => ({
        createdAt: row.created_at,
        id: row.id,
        teamId: row.team_id,
        userId: row.user_id,
      })
    ),
  };
}
