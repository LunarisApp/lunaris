// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { runtimeEventSchema } from "./protocol";
import { AgentWorkRuntime } from "./runtime";
import { resourceToolDefinitions, resolveResourceTool } from "./tools";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
function setup(authenticated = false) {
  const directory = mkdtempSync(join(tmpdir(), "lunaris-agent-test-"));
  directories.push(directory);
  if (authenticated) {
    writeFileSync(
      join(directory, "auth.json"),
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "test-token",
          refresh: "test-refresh",
          expires: Date.now() + 3_600_000,
          accountId: "test-account",
        },
      })
    );
  }
  const events: Record<string, unknown>[] = [];
  return {
    directory,
    runtime: new AgentWorkRuntime(directory, (event) =>
      events.push(runtimeEventSchema.parse(event))
    ),
    events,
  };
}

describe("Pi runtime", () => {
  it("loads account models absent from the SDK and uses their priority", async () => {
    const fetchModels = vi.fn().mockResolvedValue(
      Response.json({
        models: [
          {
            slug: "gpt-5.4",
            display_name: "GPT-5.4",
            visibility: "list",
            priority: 2,
          },
          {
            slug: "hidden",
            display_name: "Hidden",
            visibility: "hide",
            priority: 0,
          },
          {
            slug: "gpt-6",
            display_name: "GPT-6",
            visibility: "list",
            priority: 1,
            input_modalities: ["text", "image", "audio"],
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchModels);
    const { runtime, events } = setup(true);
    await runtime.handle({ type: "status", id: "status" });
    expect(events.at(-1)).toEqual({ type: "response", id: "status" });
    expect(fetchModels).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/models?client_version=0.170.0",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer test-token",
          "ChatGPT-Account-Id": "test-account",
        },
      })
    );
    await runtime.handle({ type: "new_session", id: "new" });
    expect(events.at(-1)).toEqual({ type: "response", id: "new" });
    expect(events.at(-2)).toMatchObject({
      state: {
        modelId: "gpt-6",
        models: [
          { id: "gpt-6", name: "GPT-6" },
          { id: "gpt-5.4", name: "GPT-5.4" },
        ],
      },
    });
    await runtime.handle({
      type: "prompt",
      id: "bad-model",
      text: "hello",
      modelId: "gpt-5.5",
    });
    expect(events.at(-1)).toMatchObject({
      error: "Choose an available ChatGPT model",
    });
    await runtime.handle({ type: "logout", id: "logout" });
    expect(events.at(-2)).toMatchObject({ state: { modelId: "", models: [] } });
  });
  it("explains when a signed-in account has no selectable models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ models: [] }))
    );
    const { runtime, events } = setup(true);
    await runtime.handle({ type: "status", id: "status" });
    expect(events.at(-1)).toMatchObject({
      error: "No ChatGPT models are available. Reconnect to try again.",
    });
    expect(events.at(-2)).toMatchObject({
      state: { authenticated: true, modelId: "", models: [] },
    });
  });
  it("reports catalog failures without advertising the bundled models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    );
    const { runtime, events } = setup(true);
    await runtime.handle({ type: "status", id: "status" });
    expect(events.at(-1)).toMatchObject({
      error: "Could not load ChatGPT models (503). Try again.",
    });
    expect(events.at(-2)).toMatchObject({ state: { modelId: "", models: [] } });
  });
  it("starts disconnected and creates a session without invoking a provider", async () => {
    const { runtime, events } = setup();
    await runtime.handle({ type: "new_session", id: "new" });
    expect(events.at(-1)).toEqual({ type: "response", id: "new" });
    expect(events.at(-2)).toMatchObject({
      type: "state",
      state: {
        authenticated: false,
        busy: false,
        sessionId: expect.any(String),
        messages: [],
      },
    });
  });
  it("lists and reopens persisted conversations in the current scope", async () => {
    const { directory, runtime, events } = setup();
    const manager = SessionManager.create(
      directory,
      join(directory, "sessions")
    );
    manager.appendMessage({
      role: "user",
      content: "Find my notes",
      timestamp: Date.now(),
    });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Here are your notes." }],
      api: "openai-codex-responses",
      provider: "openai-codex",
      model: "gpt-5.5",
      stopReason: "stop",
      timestamp: Date.now(),
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    await runtime.handle({ type: "status", id: "status" });
    expect(events.at(-2)).toMatchObject({
      state: {
        sessions: [{ id: manager.getSessionId(), title: "Find my notes" }],
      },
    });
    await runtime.handle({
      type: "open_session",
      id: "open",
      sessionId: manager.getSessionId(),
    });
    expect(events.at(-1)).toEqual({ type: "response", id: "open" });
    expect(events.at(-2)).toMatchObject({
      state: {
        messages: [
          { role: "user", text: "Find my notes" },
          { role: "assistant", text: "Here are your notes." },
        ],
      },
    });
    const other = setup();
    await other.runtime.handle({
      type: "open_session",
      id: "other",
      sessionId: manager.getSessionId(),
    });
    expect(other.events.at(-1)).toMatchObject({
      error: "Conversation not found",
    });
  });
  it("requires login and refuses paths supplied as conversation IDs", async () => {
    const { runtime, events } = setup();
    await runtime.handle({
      type: "prompt",
      id: "send",
      text: "hello",
      modelId: "gpt-5.5",
    });
    expect(events.at(-1)).toMatchObject({
      error: "Connect your ChatGPT account first",
    });
    await runtime.handle({
      type: "open_session",
      id: "open",
      sessionId: "../../auth.json",
    });
    expect(events.at(-1)).toMatchObject({ error: "Conversation not found" });
  });
  it("rejects malformed commands without running them", async () => {
    const { runtime, events } = setup();
    await runtime.handle({ type: "prompt", id: "send", text: " " });
    expect(events).toEqual([
      { type: "response", id: "send", error: "Invalid Agent Work command" },
    ]);
  });
  it("reports malformed envelopes without inventing a request ID", async () => {
    const { runtime, events } = setup();
    await runtime.handle(null);
    expect(events).toEqual([
      { type: "error", message: "Invalid Agent Work command" },
    ]);
  });
});

describe("resource tools", () => {
  it("excludes shell, file access, organization administration and model-controlled organization IDs", () => {
    const definitions = resourceToolDefinitions();
    expect(definitions.length).toBeGreaterThan(5);
    expect(definitions.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(["bash"])
    );
    for (const tool of definitions) {
      expect(tool.parameters.properties).not.toHaveProperty("organizationId");
    }
    expect(() => resolveResourceTool("bash", {}, "org-1")).toThrow(
      "Unknown resource tool"
    );
    expect(() =>
      resolveResourceTool("update_organization", {}, "org-1")
    ).toThrow("Unknown resource tool");
  });
  it("pins reads to the active organization and validates input", () => {
    const resolved = resolveResourceTool(
      "list_workspaces",
      { organizationId: "other-org", limit: 10 },
      "org-1"
    );
    expect(resolved).toMatchObject({
      mutation: false,
      request: { path: "/v1/organizations/org-1/workspaces" },
    });
    expect(() => resolveResourceTool("get_resource", {}, "org-1")).toThrow();
  });
  it("requires review for extension writes", () => {
    const resolved = resolveResourceTool(
      "rich_text_create_document",
      { workspaceId: "ws-1", name: "Notes", idempotencyKey: "create-notes-1" },
      "org-1"
    );
    expect(resolved.mutation).toBe(true);
    expect(resolved.request.method).toBe("POST");
  });
});
