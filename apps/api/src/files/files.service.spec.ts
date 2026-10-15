import { describe, expect, it, mock } from "bun:test";
import { OrganizationMismatchError } from "../sync/sync.errors";
import { FilesService } from "./files.service";
function makeDb(rows: { id: string }[]) {
  return { db: { select: () => ({ from: () => ({ where: async () => rows,
    innerJoin: () => ({ where: async () => [] }) }) }) } };
}
function makeStorage() {
  return { getSignedDownloadUrl: mock((key: string) => Promise.resolve(`https://storage.example.com/download/${key}`)) };
}
describe("FilesService", () => {
  it("signs download keys from explicit file extension", async () => {
    const storage = makeStorage();
    const service = new FilesService(
      makeDb([{ id: "workspace_1" }]) as never,
      storage as never
    );

    const result = await service.getDownloadUrl({
      fileId: "att-1",
      fileExtension: "png",
      organizationId: "org_1",
      workspaceId: "workspace_1",
    });

    expect(result.downloadUrl).toBe(
      "https://storage.example.com/download/files/org_1/workspace_1/att-1.png"
    );
    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
      "files/org_1/workspace_1/att-1.png",
      600
    );
  });

  it("rejects workspace access outside active organization", async () => {
    const service = new FilesService(makeDb([]) as never, makeStorage() as never);

    await expect(
      service.getDownloadUrl({
        fileId: "att-1",
        filename: "att-1.pdf",
        organizationId: "org_1",
        workspaceId: "workspace_1",
      })
    ).rejects.toBeInstanceOf(OrganizationMismatchError);
  });
});
