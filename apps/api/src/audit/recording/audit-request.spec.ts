import { describe, expect, it } from "bun:test";
import type { ExecutionContext } from "@nestjs/common";
import { auditInputForRequest } from "./audit-request";

describe("auditInputForRequest", () => {
  it("retains every offline sync mutation identity without content", () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          body: {
            transactions: [
              {
                crud: [
                  {
                    data: { name: "Private" },
                    id: "workspace_1",
                    op: "PUT",
                    type: "workspaces",
                  },
                  { id: "item_1", op: "DELETE", type: "workspace_resources" },
                ],
              },
            ],
          },
          params: {},
          session: {
            session: { activeOrganizationId: "organization_1" },
            user: { id: "user_1" },
          },
          url: "/v1/sync/ingest",
          user: { id: "user_1" },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(auditInputForRequest(context, "syncIngested", "success")).toEqual(
      expect.objectContaining({
        action: "sync.ingested",
        target: {
          id: "organization_1",
          mutations: [
            { id: "workspace_1", op: "PUT", type: "workspaces" },
            { id: "item_1", op: "DELETE", type: "workspace_resources" },
          ],
          tenantId: "organization_1",
          type: "organization",
        },
      })
    );
  });

  it("uses semantic storage IDs instead of response row IDs", () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: {
            workspaceId: "workspace_1",
            storageId: "storage_1",
          },
          session: {
            session: { activeOrganizationId: "organization_1" },
            user: { id: "user_1" },
          },
          url: "/v1/workspaces/workspace_1/storage/storage_1/yjs/json",
          user: { id: "user_1" },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(
      auditInputForRequest(
        context,
        "workspaceStorageRead",
        "success",
        undefined,
        { id: "database_row_1" }
      ).target?.id
    ).toBe("storage_1");
  });

  it("uses the file ID for file storage actions", () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { fileId: "file_1" },
          session: {
            session: { activeOrganizationId: "organization_1" },
            user: { id: "user_1" },
          },
          url: "/v1/files/file_1",
          user: { id: "user_1" },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(
      auditInputForRequest(context, "fileDeleted", "success").target?.id
    ).toBe("file_1");
  });

  it("attributes verified agent denials before principal creation", () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          auditActor: { id: "user_1", type: "api" },
          params: {
            workspaceId: "workspace_1",
            organizationId: "organization_1",
          },
          url: "/v1/organizations/organization_1/workspaces/workspace_1",
        }),
      }),
    } as unknown as ExecutionContext;

    expect(
      auditInputForRequest(context, "workspaceUpdated", "denied").actor
    ).toEqual({ id: "user_1", type: "api" });
  });
});
