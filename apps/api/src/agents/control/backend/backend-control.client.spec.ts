import { describe, expect, it, mock } from "bun:test";
import type { AgentPrincipal } from "../access/agent-principal";
import { BackendControlClientFactory } from "./backend-control.client";

const principal: AgentPrincipal = {
  actorId: "user_1",
  clientId: "client_1",
  kind: "oauth",
  scopes: ["file:read"],
  organizationIds: null,
};

function createFactory(
  workspaceAccess: () => Promise<unknown>,
  scopes: AgentPrincipal["scopes"] = principal.scopes
) {
  const getDownloadUrl = mock(async () => {
    await workspaceAccess();
    return { downloadUrl: "https://files.example/file" };
  });
  const getWorkspace = mock(workspaceAccess);
  const searchResources = mock(() =>
    Promise.resolve({ items: [], nextCursor: null })
  );
  const executePluginOperation = mock(() =>
    Promise.resolve({ boardId: "board_1", properties: [] })
  );
  const audit = mock(() => Promise.resolve());
  const factory = new BackendControlClientFactory(
    {
      assertAgentEligible: mock(() => Promise.resolve()),
      getFileDownloadUrl: getDownloadUrl,
      searchResources,
    } as never,
    {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ id: "member_1" }]),
            }),
          }),
        }),
      },
    } as never,
    { execute: executePluginOperation } as never,
    {} as never,
    { get: getWorkspace } as never,
    { audit } as never
  );
  return {
    client: factory.create({ ...principal, scopes }),
    audit,
    getDownloadUrl,
    getWorkspace,
    searchResources,
    executePluginOperation,
  };
}

describe("BackendControlClientFactory file access", () => {
  it("delegates file storage resolution to the control service", async () => {
    const { client, getDownloadUrl } = createFactory(() =>
      Promise.resolve({ id: "workspace_1" })
    );

    await expect(
      client.getFileDownloadUrl("organization_1", "workspace_1", "storage_1")
    ).resolves.toMatchObject({
      downloadUrl: "https://files.example/file",
    });
    expect(getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("propagates workspace access failures from storage resolution", async () => {
    const error = new Error("Workspace access denied");
    const { client, getDownloadUrl } = createFactory(() =>
      Promise.reject(error)
    );

    await expect(
      client.getFileDownloadUrl("organization_1", "workspace_1", "storage_1")
    ).rejects.toBe(error);
    expect(getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("checks workspace read access before searching organization items", async () => {
    const { client, searchResources } = createFactory(
      () => Promise.resolve({ id: "workspace_1" }),
      ["workspace:read"]
    );

    await expect(
      client.searchResources("organization_1", { search: "plan" })
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(searchResources).toHaveBeenCalledWith(
      "organization_1",
      {
        search: "plan",
      },
      "user_1"
    );
  });

  it("executes read-only plugin procedures without idempotency", async () => {
    const { audit, client, executePluginOperation } = createFactory(
      () => Promise.resolve({ id: "workspace_1" }),
      ["workspace:read"]
    );

    await expect(
      client.executePluginOperation(
        "organization_1",
        "workspace_1",
        "lunaris.kanban",
        "get_board_properties",
        { boardId: "board_1" }
      )
    ).resolves.toEqual({ boardId: "board_1", properties: [] });
    expect(executePluginOperation).toHaveBeenCalledWith({
      actorId: "user_1",
      input: { boardId: "board_1" },
      operation: "get_board_properties",
      pluginId: "lunaris.kanban",
      workspaceId: "workspace_1",
      organizationId: "organization_1",
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "lunaris.kanban:get_board_properties",
        targetId: "board_1",
      })
    );
  });

  it("audits Rich Text procedures against the document item", async () => {
    const { audit, client } = createFactory(
      () => Promise.resolve({ id: "workspace_1" }),
      ["workspace:read"]
    );

    await client.executePluginOperation(
      "organization_1",
      "workspace_1",
      "lunaris.rich-text",
      "get_document",
      { documentResourceId: "document_item_1" }
    );

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "lunaris.rich-text:get_document",
        targetId: "document_item_1",
      })
    );
  });
});
