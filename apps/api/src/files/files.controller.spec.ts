import { beforeEach, describe, expect, it, mock } from "bun:test";
import { permission } from "@repo/auth/permissions";
import { mockEvlogLogger } from "../../test/preload";
import { PERMISSION_METADATA } from "../security/permissions/permission.decorator";

const loggerSet = mockEvlogLogger.set;

const { FilesController } = await import("./files.controller");

function makeSession() {
  return {
    user: { id: "user_1" },
    session: { activeOrganizationId: "org_1" },
  };
}

function loggedContext() {
  return (loggerSet.mock.calls as unknown as Array<[unknown]>)[0]?.[0];
}

describe("FilesController", () => {
  let files: {
    createUpload: ReturnType<typeof mock>;
    getDownloadUrl: ReturnType<typeof mock>;
    deleteFile: ReturnType<typeof mock>;
  };
  let controller: InstanceType<typeof FilesController>;

  beforeEach(() => {
    loggerSet.mockReset();
    files = {
      createUpload: mock(() => Promise.resolve({ key: "key", uploadUrl: "url" })),
      getDownloadUrl: mock(() => Promise.resolve({ downloadUrl: "url" })),
      deleteFile: mock(() => Promise.resolve({ id: "att_1" })),
    };
    controller = new FilesController(files as never, { create: files.createUpload } as never);
  });

  it("creates a session with the authenticated organization and user", async () => {
    const body = { id: crypto.randomUUID(), fileId: "att_1", mediaType: "image/png", sizeBytes: 123, workspaceId: "workspace_1" };
    await controller.createUpload(makeSession() as never, body);
    expect(files.createUpload).toHaveBeenCalledWith({ organizationId: "org_1", userId: "user_1" }, body);
  });

  it("sets safe download request log context", async () => {
    await controller.getDownloadUrl(makeSession() as never, "att_1", {
      filename: "private-title.pdf",
      workspaceId: "workspace_1",
    });

    expect(loggerSet).toHaveBeenCalledWith({
      user: { id: "user_1" },
      organization: { id: "org_1" },
      file: {
        operation: "download-url",
        workspaceId: "workspace_1",
        fileId: "att_1",
      },
    });
    expect(JSON.stringify(loggedContext())).not.toContain("private-title.pdf");
  });

  it("sets safe delete request log context", async () => {
    await controller.deleteFile(makeSession() as never, "att_1", {
      filename: "private-title.pdf",
      workspaceId: "workspace_1",
    });

    expect(loggerSet).toHaveBeenCalledWith({
      user: { id: "user_1" },
      organization: { id: "org_1" },
      file: {
        operation: "delete",
        workspaceId: "workspace_1",
        fileId: "att_1",
      },
    });
    expect(JSON.stringify(loggedContext())).not.toContain("private-title.pdf");
  });

  it("declares content permissions for file operations", () => {
    expect(
      Reflect.getMetadata(
        PERMISSION_METADATA,
        FilesController.prototype.createUpload,
      ),
    ).toEqual(permission.content.write);
    expect(
      Reflect.getMetadata(
        PERMISSION_METADATA,
        FilesController.prototype.getDownloadUrl,
      ),
    ).toEqual(permission.content.read);
    expect(
      Reflect.getMetadata(
        PERMISSION_METADATA,
        FilesController.prototype.deleteFile,
      ),
    ).toEqual(permission.content.delete);
  });
});
