import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LunarisControlClient } from "@repo/agent-contracts";
import type { AgentWorkEvent } from "@repo/platform";
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  channel: null as null | { onmessage: (value: unknown) => void },
  route: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  Channel: class {
    onmessage = (_value: unknown) => {};
    constructor() {
      native.channel = this;
    }
  },
}));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("./local-content-router", () => ({
  routeLocalContentRequest: native.route,
}));
import { desktopAgentWork, registerAgentWorkResources } from "./agent-work";
const scope = {
  apiUrl: "http://localhost:3000",
  organizationId: "org-1",
  userId: "user-1",
};
const tool = {
  type: "tool_request",
  id: "tool-1",
  name: "rich_text_create_document",
  input: {
    workspaceId: "ws-1",
    name: "Notes",
    idempotencyKey: "create-notes-1",
  },
};
function emit(value: unknown) {
  native.channel?.onmessage({ type: "line", data: JSON.stringify(value) });
}
beforeEach(() => {
  native.invoke.mockReset().mockResolvedValue(undefined);
  native.route
    .mockReset()
    .mockResolvedValue({ status: 200, body: { success: true } });
});

describe("desktop Agent Work bridge", () => {
  it.each([
    { type: "state", state: {} },
    { type: "response", id: "invalid", error: { unexpected: true } },
    null,
  ])(
    "disconnects malformed events and rejects pending requests: %j",
    async (event) => {
      const listener = vi.fn();
      const connection = await desktopAgentWork.connect(scope, listener);
      const pending = connection.request({ type: "status" });
      emit(event);
      await expect(pending).rejects.toThrow("Invalid Agent Work event");
      expect(listener).toHaveBeenLastCalledWith({
        type: "disconnected",
        message: "Invalid Agent Work event",
      });
      expect(native.invoke).toHaveBeenCalledWith(
        "agent_work_stop",
        expect.any(Object),
      );
      expect(native.route).not.toHaveBeenCalled();
      await expect(connection.request({ type: "status" })).rejects.toThrow(
        "disconnected",
      );
    },
  );
  it("waits for approval and applies a resource write at most once", async () => {
    const events: AgentWorkEvent[] = [];
    const unregister = registerAgentWorkResources({
      scope,
      client: {} as LunarisControlClient,
    });
    const connection = await desktopAgentWork.connect(scope, (event) =>
      events.push(event),
    );
    emit(tool);
    expect(events.at(-1)?.type).toBe("approval");
    expect(native.route).not.toHaveBeenCalled();
    await Promise.all([
      connection.resolveTool(tool.id, true),
      connection.resolveTool(tool.id, true),
    ]);
    expect(native.route).toHaveBeenCalledTimes(1);
    await connection.close();
    unregister();
  });
  it("declines without mutating and refuses stale organization context", async () => {
    const unregister = registerAgentWorkResources({
      scope,
      client: {} as LunarisControlClient,
    });
    const connection = await desktopAgentWork.connect(scope, () => {});
    emit(tool);
    await connection.resolveTool(tool.id, false);
    expect(native.route).not.toHaveBeenCalled();
    emit({ ...tool, id: "tool-2" });
    unregister();
    await connection.resolveTool("tool-2", true);
    expect(native.route).not.toHaveBeenCalled();
    expect(native.invoke).toHaveBeenCalledWith(
      "agent_work_send",
      expect.objectContaining({
        message: expect.objectContaining({ error: true, toolCallId: "tool-2" }),
      }),
    );
    await connection.close();
  });
  it("returns malformed tool input as an error without hanging the turn", async () => {
    const connection = await desktopAgentWork.connect(scope, () => {});
    emit({ ...tool, input: {} });
    expect(native.route).not.toHaveBeenCalled();
    expect(native.invoke).toHaveBeenCalledWith(
      "agent_work_send",
      expect.objectContaining({
        message: expect.objectContaining({ toolCallId: tool.id, error: true }),
      }),
    );
    await connection.close();
  });
  it("rejects pending requests when the process exits", async () => {
    const listener = vi.fn();
    const connection = await desktopAgentWork.connect(scope, listener);
    emit(tool);
    const request = connection.request({ type: "status" });
    native.channel?.onmessage({ type: "closed" });
    await expect(request).rejects.toThrow("disconnected");
    expect(listener).toHaveBeenLastCalledWith({
      type: "disconnected",
      message: expect.stringContaining("disconnected"),
    });
    await connection.resolveTool(tool.id, true);
    expect(native.route).not.toHaveBeenCalled();
    await connection.close();
  });
});
