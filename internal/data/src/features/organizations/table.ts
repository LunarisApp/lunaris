import { column, type RowType, Table } from "@powersync/common";

export const ORGANIZATIONS_TABLE = "organization";
export const MEMBERS_TABLE = "member";
export const TEAMS_TABLE = "team";
export const TEAM_MEMBERS_TABLE = "team_member";
export const USERS_TABLE = "user";

export const createOrganizationTable = () =>
  new Table(
    {
      name: column.text,
      slug: column.text,
      logo: column.text,
      created_at: column.text,
      is_personal: column.integer,
      yjs_retention_days: column.integer,
      deletion_requested_at: column.text,
      deletion_purge_after: column.text,
    },
    {
      indexes: {
        organization_slug_idx: ["slug"],
      },
    }
  );

export const createMemberTable = () =>
  new Table(
    {
      organization_id: column.text,
      user_id: column.text,
      role: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        member_organization_idx: ["organization_id"],
        member_organization_user_idx: ["organization_id", "user_id"],
        member_user_idx: ["user_id"],
      },
    }
  );

export const createUserTable = () =>
  new Table({
    name: column.text,
    email: column.text,
    image: column.text,
  });

export const createOrganizationTeamTable = () =>
  new Table(
    {
      name: column.text,
      organization_id: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    {
      indexes: {
        team_organization_idx: ["organization_id"],
      },
    }
  );

export const createOrganizationTeamMemberTable = () =>
  new Table(
    {
      team_id: column.text,
      user_id: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        team_member_team_idx: ["team_id"],
        team_member_user_idx: ["user_id"],
      },
    }
  );

export type OrganizationEntity = RowType<
  ReturnType<typeof createOrganizationTable>
>;
export type MemberEntity = RowType<ReturnType<typeof createMemberTable>>;
export type UserEntity = RowType<ReturnType<typeof createUserTable>>;
export type OrganizationTeamEntity = RowType<
  ReturnType<typeof createOrganizationTeamTable>
>;
export type OrganizationTeamMemberEntity = RowType<
  ReturnType<typeof createOrganizationTeamMemberTable>
>;
