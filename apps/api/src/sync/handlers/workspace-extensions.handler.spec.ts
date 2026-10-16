import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { permission } from "@repo/auth/permissions";
import { type MockAudit, mockAudit } from "evlog";
import { extensionCatalogService } from "../../extensions/registries/extension-catalog.service";
import { workspaceExtensionsHandler } from "./workspace-extensions.handler";

const release = {
  api: "^0.9.0",
  descriptor: {
    bytes: 123,
    sha256: "a".repeat(64),
    url: "https://extensions.example/plugin.json",
  },
  runtime: { kind: "iframe" as const, protocol: 6 as const },
  status: "active" as const,
  version: "1.0.0",
};
const originalRequireActiveVersion =
  extensionCatalogService.requireActiveVersion.bind(extensionCatalogService);

function database(...results: unknown[][]) {
  const queue = [...results];
  return {
    select: mock(() => ({
      from: mock(() => ({
        innerJoin: mock(() => ({
          where: mock(() => Promise.resolve(queue.shift() ?? [])),
        })),
        where: mock(() => {
          const rows = queue.shift() ?? [];
          return {
            limit: mock(() => ({
              for: mock(() => Promise.resolve(rows)),
              then: (
                resolve: (value: unknown[]) => unknown,
                reject?: (reason: unknown) => unknown
              ) => Promise.resolve(rows).then(resolve, reject),
            })),
            then: (
              resolve: (value: unknown[]) => unknown,
              reject?: (reason: unknown) => unknown
            ) => Promise.resolve(rows).then(resolve, reject),
          };
        }),
      })),
    })),
  };
}

function marketplaceData(overrides: Record<string, unknown> = {}) {
  return {
    descriptorBytes: release.descriptor.bytes,
    descriptorSha256: release.descriptor.sha256,
    descriptorUrl: release.descriptor.url,
    enabled: true,
    extensionId: "com.example.plugin",
    workspaceId: "workspace-1",
    registryId: "registry-1",
    version: release.version,
    ...overrides,
  };
}

afterEach(() => {
  extensionCatalogService.requireActiveVersion = originalRequireActiveVersion;
});

describe("workspaceExtensionsHandler", () => {
  let captured: MockAudit;

  beforeEach(() => {
    captured = mockAudit();
  });

  afterEach(() => {
    captured.restore();
  });

  it("lets workspace writers install an active release from their registry", async () => {
    const requireActiveVersion = mock(async () => release);
    extensionCatalogService.requireActiveVersion = requireActiveVersion;
    const tx = database(
      [{ id: "workspace-1" }],
      [
        {
          id: "registry-1",
          manifestUrl: "https://extensions.example/marketplace.json",
          official: false,
        },
      ]
    );

    await workspaceExtensionsHandler.authorize(
      tx as never,
      "PUT",
      "workspace-extension-1",
      marketplaceData(),
      "org-1",
      "user-1"
    );

    expect(requireActiveVersion).toHaveBeenCalledWith(
      "https://extensions.example/marketplace.json",
      "com.example.plugin",
      "1.0.0"
    );
    expect(workspaceExtensionsHandler.permissions.DELETE).toEqual(
      permission.content.write
    );
  });

  it("rejects incomplete descriptor provenance", async () => {
    await expect(
      workspaceExtensionsHandler.authorize(
        database([{ id: "workspace-1" }]) as never,
        "PUT",
        "workspace-extension-1",
        marketplaceData({ descriptorSha256: null }),
        "org-1",
        "user-1"
      )
    ).rejects.toThrow("Invalid workspace extension");
  });

  it("reserves lunaris IDs for the official registry", async () => {
    await expect(
      workspaceExtensionsHandler.authorize(
        database(
          [{ id: "workspace-1" }],
          [
            {
              id: "registry-1",
              manifestUrl: "https://extensions.example/marketplace.json",
              official: false,
            },
          ]
        ) as never,
        "PUT",
        "workspace-extension-1",
        marketplaceData({ extensionId: "lunaris.fake" }),
        "org-1",
        "user-1"
      )
    ).rejects.toThrow("Invalid workspace extension");
  });

  it("accepts bundled rows without release provenance", async () => {
    await expect(
      workspaceExtensionsHandler.authorize(
        database([{ id: "workspace-1" }]) as never,
        "PUT",
        "workspace-extension-1",
        {
          enabled: false,
          extensionId: "lunaris.rich-text",
          workspaceId: "workspace-1",
          registryId: null,
          version: null,
        },
        "org-1",
        "user-1"
      )
    ).resolves.toBeUndefined();
  });

  it("accepts disable-only patches for marketplace extensions", async () => {
    const requireActiveVersion = mock(async () => release);
    extensionCatalogService.requireActiveVersion = requireActiveVersion;
    const data: Record<string, unknown> = { enabled: 0 };
    workspaceExtensionsHandler.transform?.(data);

    await expect(
      workspaceExtensionsHandler.authorize(
        database([{ hasAccess: true }]) as never,
        "PATCH",
        "workspace-extension-1",
        data,
        "org-1",
        "user-1"
      )
    ).resolves.toBeUndefined();

    expect(data.enabled).toBe(false);
    expect(requireActiveVersion).not.toHaveBeenCalled();
  });

  it("still rejects release changes that disable marketplace extensions", async () => {
    await expect(
      workspaceExtensionsHandler.authorize(
        database([{ hasAccess: true }], [marketplaceData()]) as never,
        "PATCH",
        "workspace-extension-1",
        { enabled: false, version: "2.0.0" },
        "org-1",
        "user-1"
      )
    ).rejects.toThrow("Invalid workspace extension");
  });

  it("records each marketplace mutation as a distinct tenant audit", async () => {
    const installed = await workspaceExtensionsHandler.prepareAudit?.(
      database() as never,
      "PUT",
      "workspace-extension-1",
      marketplaceData(),
      "org-1",
      "user-1"
    );
    const updated = await workspaceExtensionsHandler.prepareAudit?.(
      database([marketplaceData()]) as never,
      "PATCH",
      "workspace-extension-1",
      { descriptorSha256: "b".repeat(64), version: "1.1.0" },
      "org-1",
      "user-1"
    );

    installed?.();
    updated?.();

    expect(captured.events).toHaveLength(2);
    expect(captured.events.map((event) => event.action)).toEqual([
      "workspace-extension.installed",
      "workspace-extension.updated",
    ]);
    expect(captured.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context: { tenantId: "org-1" },
          target: expect.objectContaining({
            id: "workspace-extension-1",
            workspaceId: "workspace-1",
            tenantId: "org-1",
            type: "workspaceExtension",
          }),
        }),
      ])
    );
  });
});
