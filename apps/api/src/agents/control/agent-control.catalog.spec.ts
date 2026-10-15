import { describe, expect, it } from "bun:test";
import { RequestMethod } from "@nestjs/common";
import {
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import {
  type AgentOperationId,
  agentOperationIds,
  agentOperations,
} from "@repo/agent-contracts";
import { permission } from "@repo/auth/permissions";
import {
  DEFER_PERMISSION_METADATA,
  PERMISSION_METADATA,
} from "../../security/permissions/permission.decorator";
import { AgentControlController } from "./agent-control.controller";
import {
  AGENT_SCOPE_METADATA,
  agentOperationId,
} from "./access/agent-principal";

const requestMethods: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.DELETE]: "DELETE",
  [RequestMethod.GET]: "GET",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.POST]: "POST",
};

describe("AgentControlController catalog", () => {
  it("matches every shared operation route, method, and scope", () => {
    expect(
      Reflect.getMetadata(
        DEFER_PERMISSION_METADATA,
        AgentControlController,
      ),
    ).toBe(true);
    const controllerPath = Reflect.getMetadata(
      PATH_METADATA,
      AgentControlController,
    ) as string;
    const prototype = AgentControlController.prototype as unknown as Record<
      string,
      object
    >;
    const catalog = Object.getOwnPropertyNames(prototype).flatMap(
      (handlerName) => {
        const handler = prototype[handlerName];
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          | RequestMethod
          | undefined;
        if (method === undefined) return [];
        const operation = agentOperationId(handlerName) as AgentOperationId;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
        return [
          {
            method: requestMethods[method],
            operation,
            path: `/v1/${[controllerPath, path].filter(Boolean).join("/")}`
              .replace(/\/+/gu, "/")
              .replace(/\/$/u, "")
              .replace(/:([A-Za-z0-9_]+)/gu, "{$1}"),
            permission: Reflect.getMetadata(PERMISSION_METADATA, handler),
            scope: Reflect.getMetadata(AGENT_SCOPE_METADATA, handler),
          },
        ];
      },
    );

    expect(catalog.map(({ operation }) => operation).sort()).toEqual(
      [...agentOperationIds].sort(),
    );
    for (const route of catalog) {
      const definition = agentOperations[route.operation];
      expect(route).toMatchObject({
        method: definition.transport.method,
        path: definition.transport.path,
        scope: definition.scope,
      });
      if (route.operation === "list_organizations") {
        expect(route.permission).toBeUndefined();
      } else {
        expect(typeof route.permission?.action).toBe("string");
        expect(typeof route.permission?.resource).toBe("string");
      }
    }
    expect(
      catalog.find(
        ({ operation }) => operation === "get_file_download_url",
      )?.permission,
    ).toEqual(permission.content.read);
  });
});
