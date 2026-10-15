import { describe, expect, it } from "bun:test";
import { buildManifest } from "./manifest.utils";

describe("buildManifest", () => {
  it("returns runtime config from env-backed inputs", () => {
    const result = buildManifest({
      appRegion: "us",
      apiUrl: "https://api-us.lunaris.app",
      displayName: "Lunaris US",
      syncUrl: "https://sync-us.lunaris.app",
      storageUrl: "https://storage-us.lunaris.app",
    });

    expect(result).toEqual({
      apiUrl: "https://api-us.lunaris.app",
      auth: "oauth",
      capabilities: { passwordResetEmail: false },
      signupsAllowed: true,
      socialProviders: [],
      displayName: "Lunaris US",
      schemaVersion: 1,
      serverId: "us",
      syncUrl: "https://sync-us.lunaris.app",
      regionId: "us",
      storageUrl: "https://storage-us.lunaris.app",
    });
  });
});
