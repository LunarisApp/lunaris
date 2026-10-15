import { describe, expect, it } from "vitest";
import {
  isOrganizationDirectoryCurrent,
  resolveOrganizationDirectory,
} from "./organization-directory";

describe("organization directory", () => {
  it("maps synced organizations and skips malformed rows", () => {
    expect(
      resolveOrganizationDirectory([
        {
          created_at: "2026-07-27T00:00:00.000Z",
          id: "organization-1",
          logo: "logo.png",
          name: "Northstar",
          slug: "northstar",
        },
        {
          id: "organization-invalid",
          name: null,
          slug: "invalid",
        },
      ]),
    ).toEqual([{
      createdAt: "2026-07-27T00:00:00.000Z",
      id: "organization-1",
      logo: "logo.png",
      name: "Northstar",
      slug: "northstar",
    }]);
  });

  it("adds active Better Auth organization only when PowerSync lacks it", () => {
    const active = {
      createdAt: new Date("2026-07-27T00:00:00.000Z"),
      id: "organization-1",
      name: "Northstar",
      slug: "northstar",
    };

    expect(resolveOrganizationDirectory([], active, true)).toEqual([{
      createdAt: "2026-07-27T00:00:00.000Z",
      id: "organization-1",
      logo: null,
      name: "Northstar",
      slug: "northstar",
    }]);
    expect(
      resolveOrganizationDirectory([{
        id: "organization-1",
        name: "Synced Northstar",
        slug: "northstar",
      }], active, true),
    ).toHaveLength(1);
  });

  it("drops an active fallback after authoritative sync removes it", () => {
    expect(
      resolveOrganizationDirectory([], {
        id: "organization-1",
        name: "Northstar",
        slug: "northstar",
      }),
    ).toEqual([]);
  });

  it("reports current only after successful directory sync", () => {
    expect(
      isOrganizationDirectoryCurrent({
        error: null,
        isFetching: false,
        isLoading: false,
      }),
    ).toBe(true);
    expect(
      isOrganizationDirectoryCurrent({
        error: null,
        isFetching: true,
        isLoading: false,
      }),
    ).toBe(false);
    expect(
      isOrganizationDirectoryCurrent({
        error: new Error("sync failed"),
        isFetching: false,
        isLoading: false,
      }),
    ).toBe(false);
  });
});
