// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { projectMessages } from "./messages";

type Message = AgentSession["messages"][number];
const assistant = {
  role: "assistant",
  api: "openai-codex-responses",
  provider: "openai-codex",
  model: "gpt-5.5",
  stopReason: "toolUse",
  timestamp: 1,
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  content: [
    { type: "text", text: "I’ll find those notes." },
    {
      type: "toolCall",
      id: "a",
      name: "search_resources",
      arguments: { query: "notes" },
    },
    {
      type: "toolCall",
      id: "b",
      name: "get_resource",
      arguments: { id: "missing" },
    },
  ],
} satisfies Message;
const result = (id: string, isError = false): Message => ({
  role: "toolResult",
  toolCallId: id,
  toolName: id === "a" ? "search_resources" : "get_resource",
  content: [
    { type: "text", text: isError ? "Resource not found" : '{"resources":[]}' },
  ],
  isError,
  timestamp: 2,
});

describe("tool transcript projection", () => {
  it("preserves original user and assistant timestamps", () => {
    const rows = projectMessages([
      { role: "user", content: "Hello", timestamp: 123 },
      assistant,
    ], new Set());
    expect(rows[0].timestamp).toBe(123);
    expect(rows[1].timestamp).toBe(assistant.timestamp);
  });
  it("joins out-of-order results by call ID and keeps one row per call", () => {
    const rows = projectMessages(
      [assistant, result("b", true), result("a")],
      new Set()
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      role: "assistant",
      text: "I’ll find those notes.",
    });
    expect(rows[1]).toMatchObject({
      id: "tool:a",
      toolInput: { query: "notes" },
      toolStatus: "completed",
      text: '{"resources":[]}',
    });
    expect(rows[2]).toMatchObject({
      id: "tool:b",
      toolStatus: "failed",
      isError: true,
    });
  });
  it("marks only pending calls as running and preserves row identity after completion", () => {
    const pending = projectMessages([assistant], new Set(["a"]));
    expect(pending[1]).toMatchObject({ id: "tool:a", toolStatus: "running" });
    expect(pending[2]).toMatchObject({ toolStatus: "stopped" });
    expect(projectMessages([assistant, result("a")], new Set())[1].id).toBe(
      pending[1].id
    );
  });
  it("keeps orphaned results and assistant errors visible", () => {
    expect(projectMessages([result("a")], new Set())[0]).toMatchObject({
      role: "tool",
      toolStatus: "completed",
    });
    const rows = projectMessages(
      [
        {
          ...assistant,
          content: [],
          stopReason: "error",
          errorMessage: "Provider unavailable",
        },
      ],
      new Set()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      isError: true,
      text: "Provider unavailable",
    });
  });
});
