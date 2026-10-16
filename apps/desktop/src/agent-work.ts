import type { LunarisControlClient } from "@repo/agent-contracts";
import type {
  AgentWorkApproval,
  AgentWorkEvent,
  AgentWorkManager,
  AgentWorkScope,
} from "@repo/platform";
import { log } from "evlog";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  runtimeEventSchema,
  type RuntimeCommand,
} from "../agent-work/protocol";
import { resolveResourceTool } from "../agent-work/tools";
import { routeLocalContentRequest } from "./local-content-router";

interface ResourceBridge {
  client: LunarisControlClient;
  scope: AgentWorkScope;
}
let resourceBridge: ResourceBridge | undefined;
const scopeKey = (scope: AgentWorkScope) =>
  JSON.stringify([scope.apiUrl, scope.userId, scope.organizationId]);

export function registerAgentWorkResources(bridge: ResourceBridge) {
  resourceBridge = bridge;
  return () => {
    if (resourceBridge === bridge) {
      resourceBridge = undefined;
    }
  };
}

export const desktopAgentWork: AgentWorkManager = {
  async connect(scope, listener) {
    const connectionId = crypto.randomUUID();
    let closed = false;
    const requests = new Map<
      string,
      { resolve: () => void; reject: (error: Error) => void }
    >();
    const approvals = new Map<string, AgentWorkApproval>();
    const send = (message: RuntimeCommand) =>
      invoke<void>("agent_work_send", { connectionId, message });
    const notify = (event: AgentWorkEvent) => {
      if (!closed) {
        listener(event);
      }
    };
    const report = (error: unknown) =>
      notify({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    const disconnect = (error: Error) => {
      for (const request of requests.values()) {
        request.reject(error);
      }
      requests.clear();
      approvals.clear();
      notify({ type: "disconnected", message: error.message });
      closed = true;
    };
    const finishTool = async (id: string, result: unknown, error = false) => {
      approvals.delete(id);
      notify({ type: "approval_done", id });
      await send({
        type: "tool_result",
        id: crypto.randomUUID(),
        toolCallId: id,
        result,
        error,
      });
    };
    const execute = async (tool: AgentWorkApproval) => {
      try {
        const bridge = resourceBridge;
        if (!bridge || scopeKey(bridge.scope) !== scopeKey(scope)) {
          throw new Error("Workspace connection changed. Reopen Agent Work.");
        }
        const { request } = resolveResourceTool(
          tool.name,
          tool.input,
          scope.organizationId
        );
        const result = await routeLocalContentRequest(bridge.client, {
          ...request,
          id: tool.id,
          query: new URLSearchParams(
            Object.entries(request.query).map(([key, value]) => [
              key,
              String(value),
            ])
          ).toString(),
        });
        if (closed) {
          return;
        }
        if (
          resourceBridge !== bridge &&
          (!resourceBridge ||
            scopeKey(resourceBridge.scope) !== scopeKey(scope))
        ) {
          await finishTool(
            tool.id,
            "Workspace connection changed during the operation. Inspect the resource before retrying.",
            true
          );
          return;
        }
        log.info({
          action: "desktop.agent_work.tool",
          tool: tool.name,
          outcome: result.status >= 400 ? "failure" : "success",
        });
        await finishTool(
          tool.id,
          result.status >= 400 ? JSON.stringify(result.body) : result.body,
          result.status >= 400
        );
      } catch (error) {
        if (!closed) {
          await finishTool(
            tool.id,
            error instanceof Error ? error.message : "Resource tool failed",
            true
          );
        }
      }
    };
    const events = new Channel<
      { type: "line"; data: string } | { type: "closed" }
    >();
    events.onmessage = (event) => {
      if (closed) {
        return;
      }
      if (event.type === "closed") {
        const error = new Error(
          "Agent Work disconnected. Reopen this tab to reconnect."
        );
        disconnect(error);
        return;
      }
      try {
        const parsed = runtimeEventSchema.safeParse(JSON.parse(event.data));
        if (!parsed.success) {
          throw new Error("Invalid Agent Work event");
        }
        const message = parsed.data;
        if (message.type === "response") {
          const request = requests.get(message.id);
          requests.delete(message.id);
          if (message.error) {
            request?.reject(new Error(message.error));
          } else {
            request?.resolve();
          }
        } else if (message.type === "tool_request") {
          const tool: AgentWorkApproval = {
            id: message.id,
            name: message.name,
            input: message.input,
          };
          try {
            const { mutation } = resolveResourceTool(
              tool.name,
              tool.input,
              scope.organizationId
            );
            if (mutation) {
              approvals.set(tool.id, tool);
              notify({ type: "approval", approval: tool });
            } else {
              void execute(tool).catch(report);
            }
          } catch {
            void finishTool(tool.id, "Invalid resource tool input", true).catch(
              report
            );
          }
        } else if (message.type === "tool_done") {
          approvals.delete(message.id);
          notify({ type: "approval_done", id: message.id });
        } else if (message.type === "auth") {
          if (message.url) {
            const url = new URL(message.url);
            if (
              url.protocol !== "https:" ||
              url.hostname !== "auth.openai.com"
            ) {
              throw new Error("Unexpected sign-in URL");
            }
            void open(url.href).catch(report);
          }
          notify(message);
        } else if (message.type === "state" || message.type === "error") {
          notify(message);
        }
      } catch (error) {
        disconnect(error instanceof Error ? error : new Error(String(error)));
        void invoke("agent_work_stop", { connectionId }).catch(() => undefined);
      }
    };
    await invoke("agent_work_start", {
      connectionId,
      scope: scopeKey(scope),
      events,
    });
    return {
      request(command) {
        if (closed) {
          return Promise.reject(new Error("Agent Work is disconnected"));
        }
        const id = crypto.randomUUID();
        return new Promise<void>((resolve, reject) => {
          requests.set(id, { resolve, reject });
          void send({ ...command, id }).catch((error) => {
            requests.delete(id);
            reject(error);
          });
        });
      },
      async resolveTool(id, approved) {
        const tool = approvals.get(id);
        if (!tool) {
          return;
        }
        approvals.delete(id); // Claim once; repeated clicks cannot repeat a write.
        notify({ type: "approval_done", id });
        if (approved) {
          await execute(tool);
        } else {
          await finishTool(
            id,
            "The user declined this change. Do not retry it without new instructions.",
            true
          );
        }
      },
      async close() {
        closed = true;
        for (const request of requests.values()) {
          request.reject(new Error("Agent Work closed"));
        }
        requests.clear();
        approvals.clear();
        await invoke("agent_work_stop", { connectionId });
      },
    };
  },
};
