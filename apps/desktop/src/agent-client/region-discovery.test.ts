import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REGION_DIRECTORY_URL,
  discoverRegionManifest,
  discoverRegions,
  type RegionDirectory,
} from "./region-discovery";

const DIRECTORY = {
  regions: [
    {
      displayName: "United States",
      manifestUrl: "https://api-us.lunaris.app/v1/manifest",
      regionId: "us",
      status: "available",
    },
    {
      displayName: "European Union",
      regionId: "eu",
      status: "planned",
    },
  ],
  schemaVersion: 1,
} satisfies RegionDirectory;

describe("discoverRegions", () => {
  it("loads and validates the public region directory without credentials", async () => {
    let request: Request | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return Response.json(DIRECTORY);
    });

    await expect(discoverRegions({ fetch: fetcher })).resolves.toEqual(DIRECTORY);
    expect(request?.url).toBe(DEFAULT_REGION_DIRECTORY_URL);
    expect(request?.headers.get("accept")).toBe("application/json");
    expect(request?.headers.has("authorization")).toBe(false);
    expect(request?.headers.has("x-lunaris-api-key")).toBe(false);
  });

  it("rejects available regions without a manifest URL", async () => {
    const fetcher = async () =>
      Response.json({
        regions: [
          {
            displayName: "United States",
            regionId: "us",
            status: "available",
          },
        ],
        schemaVersion: 1,
      });

    await expect(discoverRegions({ fetch: fetcher })).rejects.toMatchObject({
      code: "INVALID_REGION_DIRECTORY",
      status: 502,
    });
  });

  it("returns a stable error for unavailable discovery", async () => {
    const fetcher = async () => new Response(null, { status: 503 });

    await expect(discoverRegions({ fetch: fetcher })).rejects.toMatchObject({
      code: "REGION_DISCOVERY_FAILED",
      status: 503,
    });
  });

  it("loads a selected region manifest and verifies its identity", async () => {
    const region = DIRECTORY.regions[0];
    if (!region || region.status !== "available") {
      throw new Error("Expected available region");
    }

    await expect(
      discoverRegionManifest(region, {
        fetch: async () =>
          Response.json({
            apiUrl: "https://api-us.lunaris.app",
            regionId: "us",
            syncUrl: "https://sync-us.lunaris.app",
          }),
      }),
    ).resolves.toEqual({
      apiUrl: "https://api-us.lunaris.app",
      regionId: "us",
    });
  });

  it("rejects a manifest served for another region", async () => {
    const region = DIRECTORY.regions[0];
    if (!region || region.status !== "available") {
      throw new Error("Expected available region");
    }

    await expect(
      discoverRegionManifest(region, {
        fetch: async () =>
          Response.json({
            apiUrl: "https://api-eu.lunaris.app",
            regionId: "eu",
          }),
      }),
    ).rejects.toMatchObject({ code: "REGION_MANIFEST_MISMATCH", status: 502 });
  });
});
