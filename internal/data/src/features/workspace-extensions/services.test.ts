vi.mock("../activity/services", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));
import { recordActivity } from "../activity/services";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceExtensionsService,
  replaceWorkspaceExtensions,
  resolveEnabledWorkspaceExtensionIds,
} from "./services";

describe("unchanged workspace extension actions", () => {
  it("keeps activity stable for repeated enable, install, replace and missing uninstall", async () => {
    vi.mocked(recordActivity).mockClear();
    const row = {
      id: "extension_1", extension_id: "example", enabled: 1,
      registry_id: "registry-1", version: "1.0.0", descriptor_url: null,
      descriptor_bytes: null, descriptor_sha256: null,
    };
    const db = {
      execute: vi.fn(),
      getAll: vi.fn().mockResolvedValue([row]),
      getOptional: vi.fn().mockResolvedValue({ id: "workspace_1", visibility: WORKSPACE_VISIBILITY.local }),
    };
    const service = createWorkspaceExtensionsService(db as never, "workspace_1");
    await service.setEnabled("example", true, { defaultExtensionIds: [], knownExtensionIds: [] });
    await service.install("example", { registryId: "registry-1", version: "1.0.0", descriptor: null }, { defaultExtensionIds: [], knownExtensionIds: [] });
    db.getAll.mockResolvedValue([{ ...row, registry_id: null, version: null }]);
    await service.replace(["example"], ["example"]);
    db.getOptional.mockResolvedValueOnce({ id: "workspace_1", visibility: WORKSPACE_VISIBILITY.local }).mockResolvedValueOnce(null);
    await service.uninstall("missing");
    expect(db.execute).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe("resolveEnabledWorkspaceExtensionIds", () => {
  it("uses defaults only before a workspace has explicit state", () => {
    expect([
      ...resolveEnabledWorkspaceExtensionIds([], ["lunaris.rich-text"]),
    ]).toEqual(["lunaris.rich-text"]);
  });

  it("returns only explicitly enabled rows once configured", () => {
    const rows = [
      { enabled: 1, extension_id: "lunaris.rich-text" },
      { enabled: 0, extension_id: "lunaris.kanban" },
    ] as never;
    expect([
      ...resolveEnabledWorkspaceExtensionIds(rows, ["lunaris.kanban"]),
    ]).toEqual(["lunaris.rich-text"]);
  });
});

describe("workspace extension mutations", () => {
  const release = {
    descriptor: {
      bytes: 123,
      sha256: "a".repeat(64),
      url: "https://extensions.example/plugin.json",
    },
    registryId: "registry-1",
    version: "1.0.0",
  };

  it("updates existing state through the writable view", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute,
      getAll: vi.fn().mockResolvedValue([
        {
          extension_id: "lunaris.kanban",
          id: "existing-workspace-extension-id",
        },
      ]),
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.local,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await createWorkspaceExtensionsService(
      db as never,
      "workspace_1",
    ).setEnabled("lunaris.kanban", false, {
      defaultExtensionIds: ["lunaris.rich-text"],
      knownExtensionIds: ["lunaris.rich-text", "lunaris.kanban"],
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE local_workspace_extensions"),
      [
        0,
        expect.any(String),
        "existing-workspace-extension-id",
      ],
    );
    expect(execute.mock.calls[0]?.[0]).not.toContain("ON CONFLICT");
  });

  it("inserts state for a newly available extension", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute,
      getAll: vi.fn().mockResolvedValue([
        {
          extension_id: "lunaris.rich-text",
          id: "workspace-extension:workspace_1:lunaris.rich-text",
        },
      ]),
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.local,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await createWorkspaceExtensionsService(
      db as never,
      "workspace_1",
    ).setEnabled("lunaris.kanban", true, {
      defaultExtensionIds: ["lunaris.rich-text"],
      knownExtensionIds: ["lunaris.rich-text", "lunaris.kanban"],
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO local_workspace_extensions"),
      [
        "workspace-extension:workspace_1:lunaris.kanban",
        "workspace_1",
        "lunaris.kanban",
        1,
        null,
        null,
        null,
        null,
        null,
        expect.any(String),
        expect.any(String),
      ],
    );
    expect(execute.mock.calls[0]?.[0]).not.toContain("ON CONFLICT");
  });

  it("materializes defaults before the first override", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute,
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.local,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await createWorkspaceExtensionsService(
      db as never,
      "workspace_1",
    ).setEnabled("lunaris.kanban", false, {
      defaultExtensionIds: ["lunaris.rich-text"],
      knownExtensionIds: ["lunaris.rich-text", "lunaris.kanban"],
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[1]?.[2]).toBe("lunaris.rich-text");
    expect(execute.mock.calls[0]?.[1]?.[3]).toBe(1);
    expect(execute.mock.calls[1]?.[1]?.[2]).toBe("lunaris.kanban");
    expect(execute.mock.calls[1]?.[1]?.[3]).toBe(0);
  });

  it("installs and enables a pinned marketplace release", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute,
      getAll: vi.fn().mockResolvedValue([{
        extension_id: "com.example.plugin",
        id: "workspace-extension:workspace_1:com.example.plugin",
      }]),
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.shared,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await createWorkspaceExtensionsService(db as never, "workspace_1").install(
      "com.example.plugin",
      release,
      { defaultExtensionIds: [], knownExtensionIds: [] },
    );

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE workspace_extensions"),
      [
        "registry-1",
        "1.0.0",
        release.descriptor.url,
        123,
        release.descriptor.sha256,
        expect.any(String),
        "workspace-extension:workspace_1:com.example.plugin",
      ],
    );
    expect(execute.mock.calls[0]?.[0]).toContain("SET enabled = 1");
  });

  it("updates a target row materialized during the first install", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute,
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.local,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await createWorkspaceExtensionsService(db as never, "workspace_1").install(
      "com.example.plugin",
      release,
      {
        defaultExtensionIds: ["lunaris.rich-text"],
        knownExtensionIds: ["lunaris.rich-text", "com.example.plugin"],
      },
    );

    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[2]?.[0]).toContain("UPDATE local_workspace_extensions");
    expect(execute.mock.calls[2]?.[1]?.at(-1)).toBe(
      "workspace-extension:workspace_1:com.example.plugin",
    );
  });

  it("restores an exact disabled marketplace installation", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute,
      getAll: vi.fn().mockResolvedValue([{
        extension_id: "com.example.plugin",
        id: "workspace-extension:workspace_1:com.example.plugin",
      }]),
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.shared,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await createWorkspaceExtensionsService(db as never, "workspace_1").restore({
      descriptorBytes: release.descriptor.bytes,
      descriptorSha256: release.descriptor.sha256,
      descriptorUrl: release.descriptor.url,
      enabled: false,
      extensionId: "com.example.plugin",
      registryId: release.registryId,
      version: release.version,
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("SET enabled = 1"),
      expect.arrayContaining([release.version]),
    );
    expect(execute).toHaveBeenLastCalledWith(
      expect.stringContaining("SET enabled = ?"),
      [0, expect.any(String), "workspace-extension:workspace_1:com.example.plugin"],
    );
  });

  it("uninstalls only marketplace rows in the selected workspace", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute,
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.private,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await createWorkspaceExtensionsService(db as never, "workspace_1").uninstall(
      "com.example.plugin",
    );

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("registry_id IS NOT NULL"),
      ["workspace_1", "com.example.plugin"],
    );
  });

  it("writes explicit disabled rows for known extensions", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
      getOptional: vi.fn().mockResolvedValue({
        id: "workspace_1",
        visibility: WORKSPACE_VISIBILITY.shared,
      }),
    };
    const db = {
      writeTransaction: vi.fn(
        async (operation: (value: typeof tx) => unknown) => operation(tx),
      ),
    };

    await replaceWorkspaceExtensions({
      db: db as never,
      enabledExtensionIds: ["lunaris.rich-text"],
      knownExtensionIds: ["lunaris.rich-text", "lunaris.kanban"],
      workspaceId: "workspace_1",
    });

    expect(tx.execute).toHaveBeenCalledTimes(3);
    expect(tx.execute.mock.calls[1]?.[1]?.[3]).toBe(1);
    expect(tx.execute.mock.calls[2]?.[1]?.[3]).toBe(0);
  });
});
