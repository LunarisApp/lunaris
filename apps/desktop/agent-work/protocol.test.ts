// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runtimeCommandSchema, runtimeEventSchema } from "./protocol";

const state = {
  authenticated: true,
  busy: false,
  messages: [],
  modelId: "model",
  models: [],
  sessionId: null,
  sessions: [],
};

describe("Agent Work protocol", () => {
  it("validates commands and preserves the request ID", () => {
    expect(
      runtimeCommandSchema.parse({
        type: "prompt",
        id: "send",
        text: " Hello ",
        modelId: "model",
      }),
    ).toEqual({ type: "prompt", id: "send", text: "Hello", modelId: "model" });
    for (const input of [
      null,
      { type: "logout" },
      { type: "prompt", id: "send", text: " ", modelId: "model" },
      { type: "auth_input", id: "login", value: "" },
    ]) {
      expect(runtimeCommandSchema.safeParse(input).success).toBe(false);
    }
  });
  it("rejects incomplete tool messages at the transport boundary", () => {
    const message = {
      id: "tool:call",
      role: "tool",
      text: "",
      toolCallId: "call",
      toolName: "get_resource",
      toolStatus: "running",
    };
    expect(
      runtimeEventSchema.safeParse({
        type: "state",
        state: { ...state, messages: [message] },
      }).success,
    ).toBe(true);
    for (const field of ["toolCallId", "toolName", "toolStatus"]) {
      expect(
        runtimeEventSchema.safeParse({
          type: "state",
          state: { ...state, messages: [{ ...message, [field]: undefined }] },
        }).success,
      ).toBe(false);
    }
  });
  it("rejects malformed event payloads", () => {
    for (const input of [
      null,
      { type: "response", id: "send", error: {} },
      { type: "state", state: { ...state, authenticated: "yes" } },
      { type: "tool_request", id: "call", name: "get_resource", input: null },
    ]) {
      expect(runtimeEventSchema.safeParse(input).success).toBe(false);
    }
  });
});
