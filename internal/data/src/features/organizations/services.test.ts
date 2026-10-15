import { beforeEach, describe, expect, it, vi } from "vitest";

const { useQuery } = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock("@powersync/react", () => ({
  useQuery,
}));

import {
  useOrganizationMemberRoleQuery,
  useOrganizationMembersQuery,
  useOrganizationsQuery,
  ORGANIZATION_DIRECTORY_SYNC_STREAMS,
  ORGANIZATION_INDEX_SYNC_STREAMS,
} from "./services";

describe("organization directory queries", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: false,
    });
  });

  it("orders organizations deterministically and waits for organization index", () => {
    expect(ORGANIZATION_INDEX_SYNC_STREAMS).toEqual([{ name: "organization_index", waitForStream: true }]);
    useOrganizationsQuery();

    expect(useQuery).toHaveBeenCalledWith(
      expect.stringMatching(/ORDER BY created_at ASC, id ASC/),
      [],
      { streams: ORGANIZATION_INDEX_SYNC_STREAMS },
    );
  });

  it("joins member profiles and maps the public directory shape", () => {
    useQuery.mockReturnValue({
      data: [{
        created_at: "2026-07-27T00:00:00.000Z",
        email: "owner@example.com",
        id: "member-1",
        image: null,
        name: "Owner",
        organization_id: "organization-1",
        role: "owner",
        user_id: "user-1",
      }],
      isLoading: false,
    });

    expect(ORGANIZATION_DIRECTORY_SYNC_STREAMS).toEqual([{ name: "organization_directory", waitForStream: true }]);
    const query = useOrganizationMembersQuery("organization-1");

    expect(query.data).toEqual([{
      createdAt: "2026-07-27T00:00:00.000Z",
      id: "member-1",
      organizationId: "organization-1",
      role: "owner",
      user: {
        email: "owner@example.com",
        id: "user-1",
        image: null,
        name: "Owner",
      },
    }]);
    expect(useQuery).toHaveBeenCalledWith(
      expect.stringMatching(
        /INNER JOIN "user" user[\s\S]*WHERE member.organization_id = \?[\s\S]*ORDER BY member.id ASC/,
      ),
      ["organization-1"],
      { streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS },
    );
  });

  it("returns a normalized current user role or null", () => {
    useQuery.mockReturnValueOnce({ data: [{ role: "admin" }] });
    expect(
      useOrganizationMemberRoleQuery("organization-1", "user-1").data,
    ).toBe("editor");

    useQuery.mockReturnValueOnce({ data: [] });
    expect(
      useOrganizationMemberRoleQuery("organization-1", "user-2").data,
    ).toBeNull();
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /WHERE organization_id = \? AND user_id = \?[\s\S]*LIMIT 1/,
      ),
      ["organization-1", "user-2"],
      { streams: ORGANIZATION_INDEX_SYNC_STREAMS },
    );
  });

  it("preserves empty, loading, and error query states", () => {
    const error = new Error("directory unavailable");
    useQuery.mockReturnValue({
      data: undefined,
      error,
      isFetching: true,
      isLoading: true,
    });

    expect(useOrganizationMembersQuery(undefined)).toMatchObject({
      data: undefined,
      error,
      isFetching: true,
      isLoading: true,
    });
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      [""],
      { streams: ORGANIZATION_DIRECTORY_SYNC_STREAMS },
    );
  });
});
