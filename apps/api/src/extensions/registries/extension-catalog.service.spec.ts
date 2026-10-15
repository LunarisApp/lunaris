import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, mock } from "bun:test";
import { ExtensionCatalogService } from "./extension-catalog.service";

function catalog(status: "active" | "blocked" = "active", api = "^0.9.0") {
  return {
    displayName: "Example extensions",
    enabled: true,
    extensions: [{
      description: "Calendar",
      developer: "Example",
      id: "example.calendar",
      latestVersion: "1.0.0",
      name: "Calendar",
      repository: "https://github.com/example/calendar",
      versions: [{
        api,
        descriptor: {
          bytes: 123,
          sha256: "a".repeat(64),
          url: "https://plugins.example/releases/calendar.json",
        },
        runtime: { kind: "iframe", protocol: 6 },
        status,
        version: "1.0.0",
      }],
    }],
    generatedAt: "2026-08-07T00:00:00.000Z",
    name: "example",
    schemaVersion: 1,
  };
}

describe("ExtensionCatalogService", () => {
  it("loads an active compatible release from the selected registry", async () => {
    const fetchJson = mock(async () => catalog());

    await expect(
      new ExtensionCatalogService(fetchJson).requireActiveVersion(
        "https://plugins.example/marketplace.json",
        "example.calendar",
        "1.0.0",
      ),
    ).resolves.toMatchObject({ version: "1.0.0" });
    expect(fetchJson).toHaveBeenCalledWith(
      "https://plugins.example/marketplace.json",
      { allowPrivate: false },
    );
  });

  it.each([
    ["blocked release", catalog("blocked")],
    ["incompatible release", catalog("active", "^9.0.0")],
    ["catalog kill switch", { ...catalog(), enabled: false }],
  ])("rejects a %s", async (_name, value) => {
    const fetchJson = mock(async () => value);

    await expect(
      new ExtensionCatalogService(fetchJson).requireActiveVersion(
        "https://plugins.example/marketplace.json",
        "example.calendar",
        "1.0.0",
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
