import { describe, expect, it } from "bun:test";
import {
  agentChatGetYjsStorageJsonInputSchema,
  agentChatSearchResourcesInputSchema,
  agentChatToolNames,
} from "./chat";
import { agentOperationContracts } from "./contracts";
import { agentOperationIds, agentOperations } from "./operations";
import { serializeAgentOperation } from "./wire";

describe("agent operation catalog", () => {
  it("defines permission and risk metadata for every operation", () => {
    expect(Object.keys(agentOperations).sort()).toEqual(
      [...agentOperationIds].sort(),
    );
    for (const [id, operation] of Object.entries(agentOperations)) {
      expect(operation.description.length).toBeGreaterThan(0);
      expect(operation.description).not.toBe(id.replaceAll("_", " "));
      expect(["supported", "cloud-required"]).toContain(
        operation.offlineAvailability,
      );
      expect(operation.scope).toContain(":");
      expect(operation.transport.path).toStartWith("/v1/");
      expect(agentOperationContracts[id as keyof typeof agentOperationContracts].input).toBeDefined();
      expect(agentOperationContracts[id as keyof typeof agentOperationContracts].output).toBeDefined();
    }
  });

  it("marks operations requiring Desktop cloud connectivity", () => {
    expect(
      agentOperationIds.filter(
        (id) =>
          agentOperations[id].offlineAvailability === "cloud-required",
      ),
    ).toEqual([
      "list_organization_members",
      "update_organization",
      "invite_organization_member",
      "preview_remove_organization_member",
      "remove_organization_member",
    ]);
  });

  it("requires optimistic concurrency for organization updates", () => {
    expect(
      agentOperationContracts.update_organization.input.safeParse({
        idempotencyKey: "request-key",
        name: "Renamed",
        organizationId: "organization-1",
      }).success,
    ).toBe(false);
    expect(
      agentOperationContracts.update_organization.input.safeParse({
        expectedRevision: "revision-1",
        idempotencyKey: "request-key",
        name: "Renamed",
        organizationId: "organization-1",
      }).success,
    ).toBe(true);
  });

  it("derives in-app AI tools from agent operations", () => {
    expect(agentChatToolNames).toEqual({
      getYjsStorageJson: "get_yjs_storage_json",
      searchResources: "search_resources",
    });
    expect(
      agentChatSearchResourcesInputSchema.parse({ search: " plan " }),
    ).toMatchObject({ limit: 50, search: "plan" });
    expect(
      agentChatGetYjsStorageJsonInputSchema.parse({ storageId: "storage-1" }),
    ).toEqual({ storageId: "storage-1" });
  });

  it("validates organization item search inputs and workspace context", () => {
    expect(agentOperations.search_resources.description).toContain(
      "Organization-wide search is the default",
    );
    expect(agentOperations.search_resources.description).toContain(
      "exact workspace ID is already known",
    );
    expect(
      agentOperationContracts.search_resources.input.shape.workspaceId.description,
    ).toContain("Omit this field for the default organization-wide search");
    expect(
      agentOperationContracts.search_resources.input.safeParse({
        search: "   ",
        organizationId: "organization-1",
      }).success,
    ).toBe(false);
    expect(
      agentOperationContracts.search_resources.input.parse({
        workspaceId: "workspace-1",
        search: "  plan  ",
        organizationId: "organization-1",
      }),
    ).toMatchObject({
      limit: 50,
      workspaceId: "workspace-1",
      search: "plan",
    });
    expect(
      agentOperationContracts.search_resources.output.safeParse({
        items: [
          {
            createdAt: "2026-01-01T00:00:00.000Z",
            icon: null,
            id: "item-1",
            name: "Plan",
            parentId: null,
            resourceTypeId: "lunaris.folder",
            schemaVersion: 1,
            position: 0,
            workspaceId: "workspace-1",
            workspaceName: "Launch",
            storage: {},
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });

  it("distinguishes content, metadata, and synchronization tools", () => {
    expect(agentOperations.list_resources.description).toContain("resource metadata");
    expect(agentOperations.list_resources.description).toContain(
      "does not return document content",
    );
    expect(agentOperations.get_resource.description).toContain(
      "including named storage handles",
    );
    expect(agentOperations.get_yjs_storage_json.description).toContain(
      "structured JSON content",
    );
    expect(agentOperations.get_yjs_storage_state.description).toContain(
      "raw Yjs update-v2",
    );
    expect(agentOperations.list_key_value_storage.description).toContain(
      "key-value storage handle",
    );
  });

  it("describes mutation concurrency and preview requirements", () => {
    expect(agentOperations.update_organization.description).toContain(
      "expectedRevision",
    );
    expect(agentOperations.update_workspace.description).toContain(
      "expectedRevision",
    );
    expect(agentOperations.update_resource.description).toContain(
      "expectedRevision",
    );
    expect(agentOperations.delete_workspace.description).toContain(
      "preview_delete_workspace",
    );
    expect(agentOperations.delete_resource.description).toContain(
      "preview_delete_resource",
    );
    expect(
      agentOperationContracts.delete_workspace.input.shape.previewToken
        .description,
    ).toContain("matching preview operation");
    expect(
      agentOperationContracts.update_workspace.input.shape.expectedRevision
        .description,
    ).toContain("latest matching read");
    expect(
      agentOperationContracts.create_workspace.input.shape.idempotencyKey
        .description,
    ).toContain("retrying the identical request");
  });

  it("serializes paths, queries, bodies, and protected headers", () => {
    expect(
      serializeAgentOperation("update_resource", {
        expectedRevision: "revision-1",
        icon: null,
        idempotencyKey: "request-1",
        resourceId: "item/one",
        name: "Plan",
        workspaceId: "workspace one",
        organizationId: "organization-1",
      }),
    ).toEqual({
      body: {
        icon: null,
        name: "Plan",
      },
      headers: {
        "Idempotency-Key": "request-1",
        "If-Match": '"revision-1"',
      },
      method: "PATCH",
      path: "/v1/organizations/organization-1/workspaces/workspace%20one/resources/item%2Fone",
      query: {},
    });
    expect(
      serializeAgentOperation("search_resources", {
        limit: 25,
        workspaceId: null,
        search: "road map",
        organizationId: "organization-1",
      }),
    ).toMatchObject({
      method: "GET",
      query: {
        limit: 25,
        workspaceId: null,
        search: "road map",
      },
    });
  });

  it("requires every path parameter at serialization time", () => {
    expect(() =>
      serializeAgentOperation("get_workspace", {
        organizationId: "organization-1",
      }),
    ).toThrow("workspaceId is required");
  });
});
