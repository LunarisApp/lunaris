import { describe, expect, it, vi } from "vitest";
const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@powersync/react", () => ({ useQuery }));
import { ORGANIZATION_DIRECTORY_SYNC_STREAMS } from "@repo/data/features/organizations";
import { useOrganizationTeamMembershipsQuery, useOrganizationTeamsQuery } from "./queries";
describe("team queries", () => {
  it("maps synced teams and memberships", () => {
    useQuery.mockReturnValueOnce({
      data: [
        {
          created_at: "2026-08-27T00:00:00.000Z",
          id: "team-1",
          name: "Editorial",
          organization_id: "organization-1",
          updated_at: null,
        },
      ],
    });
    expect(useOrganizationTeamsQuery("organization-1").data).toEqual([
      {
        createdAt: "2026-08-27T00:00:00.000Z",
        id: "team-1",
        name: "Editorial",
        organizationId: "organization-1",
        updatedAt: null,
      },
    ]);

    useQuery.mockReturnValueOnce({
      data: [
        {
          created_at: null,
          id: "team-member-1",
          team_id: "team-1",
          user_id: "user-1",
        },
      ],
    });
    expect(useOrganizationTeamMembershipsQuery("organization-1").data).toEqual([
      {
        createdAt: null,
        id: "team-member-1",
        teamId: "team-1",
        userId: "user-1",
      },
    ]);
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /INNER JOIN team team ON team.id = team_member.team_id[\s\S]*WHERE team.organization_id = \?/,
      ),
      ["organization-1"],
      { streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS },
    );
  });
  it("keeps queries tenant-scoped while the active organization is unavailable", () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true });

    expect(useOrganizationTeamsQuery(undefined)).toMatchObject({
      data: undefined,
      isLoading: true,
    });
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("WHERE organization_id = ?"),
      [""],
      { streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS },
    );

    expect(useOrganizationTeamMembershipsQuery(undefined)).toMatchObject({
      data: undefined,
      isLoading: true,
    });
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("WHERE team.organization_id = ?"),
      [""],
      { streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS },
    );
  });
});
