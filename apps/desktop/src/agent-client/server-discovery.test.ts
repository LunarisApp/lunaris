import { describe, expect, it } from "vitest";
import {
  discoverRemoteServers,
  discoverServerManifest,
  isLoopbackUrl,
  mergeServerDirectories,
  serverManifestSchema,
} from "./server-discovery";

const cloud = {
  apiUrl: "https://api-us.lunaris.app",
  auth: "oauth",
  displayName: "United States",
  regionId: "us",
  schemaVersion: 1,
  serverId: "us",
  storageUrl: "https://storage-us.lunaris.app",
  syncUrl: "https://sync-us.lunaris.app",
} as const;

describe("server discovery", () => {
  it("validates the shared cloud and Desktop manifest contract", () => {
    expect(serverManifestSchema.parse(cloud)).toEqual(cloud);
    expect(
      serverManifestSchema.parse({
        apiUrl: "http://127.0.0.1:42000",
        auth: "desktop-pairing",
        displayName: "Lunaris Desktop",
        schemaVersion: 1,
        serverId: "desktop",
      })
    ).toMatchObject({ serverId: "desktop" });
  });

  it("loads a public server directory and verifies manifest identity", async () => {
    const server = {
      displayName: "United States",
      manifestUrl: "https://api-us.lunaris.app/v1/manifest",
      serverId: "us",
      status: "available",
    } as const;
    await expect(
      discoverRemoteServers({
        directoryUrl: "https://lunaris.app/.well-known/lunaris-servers",
        fetch: async () =>
          Response.json({ schemaVersion: 1, servers: [server] }),
      })
    ).resolves.toEqual({ schemaVersion: 1, servers: [server] });
    await expect(
      discoverServerManifest(server, {
        fetch: async () => Response.json(cloud),
      })
    ).resolves.toEqual(cloud);
  });

  it("reports directory failure without requesting a region directory", async () => {
    const urls: string[] = [];
    await expect(
      discoverRemoteServers({
        fetch: async (input) => {
          urls.push(input.toString());
          return Response.json({}, { status: 404 });
        },
      })
    ).rejects.toMatchObject({ code: "SERVER_DISCOVERY_UNAVAILABLE" });
    expect(urls).toEqual(["https://lunaris.app/.well-known/lunaris-servers"]);
  });

  it("deduplicates Desktop over a remote entry", () => {
    expect(
      mergeServerDirectories(
        {
          schemaVersion: 1,
          servers: [
            {
              displayName: "Stale Desktop",
              manifestUrl: "http://127.0.0.1:1/v1/manifest",
              serverId: "desktop",
              status: "available",
            },
          ],
        },
        {
          displayName: "Lunaris Desktop",
          manifestUrl: "http://127.0.0.1:42000/v1/manifest",
          serverId: "desktop",
          status: "available",
        }
      ).servers
    ).toEqual([
      {
        displayName: "Lunaris Desktop",
        manifestUrl: "http://127.0.0.1:42000/v1/manifest",
        serverId: "desktop",
        status: "available",
      },
    ]);
  });

  it("restricts Desktop credentials to loopback HTTP URLs", () => {
    expect(isLoopbackUrl(new URL("http://127.0.0.1:42000"))).toBe(true);
    expect(isLoopbackUrl(new URL("https://127.0.0.1:42000"))).toBe(false);
    expect(isLoopbackUrl(new URL("http://192.168.1.2:42000"))).toBe(false);
  });
});
