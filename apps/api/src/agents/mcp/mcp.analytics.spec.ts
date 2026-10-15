import { describe, expect, it } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import {
  PostHogMCPAnalyticsEvent,
  PostHogMCPAnalyticsProperty,
} from "@posthog/mcp";
import type { PostHog } from "posthog-node";
import {
  instrumentMcpServer,
  mcpAnalyticsOptions,
} from "./mcp.analytics";

describe("mcpAnalyticsOptions", () => {
  it("identifies the actor without changing tool schemas or duplicating errors", () => {
    expect(mcpAnalyticsOptions("user_123")).toMatchObject({
      context: false,
      enableExceptionAutocapture: false,
      identify: { distinctId: "user_123" },
    });
  });

  it("instruments only the dedicated MCP PostHog client", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const applicationPosthog = {
      capture: () => undefined,
      getLibraryId: () => "posthog-node",
      getLibraryVersion: () => "5.35.5",
    } as unknown as PostHog;
    const mcpPosthog = {
      capture: () => undefined,
      getLibraryId: () => "posthog-node",
      getLibraryVersion: () => "5.35.5",
    } as unknown as PostHog;

    expect(() =>
      instrumentMcpServer(server, mcpPosthog, "user_123"),
    ).not.toThrow();
    expect(applicationPosthog.getLibraryId()).toBe("posthog-node");
    expect(mcpPosthog.getLibraryId()).toBe("posthog-node-mcp");
  });

  it("captures v2 tool calls through the low-level server", async () => {
    const captures: Array<{
      distinctId: string;
      event: string;
      properties: Record<string, unknown>;
    }> = [];
    const server = new McpServer({ name: "test", version: "1.0.0" });
    server.registerTool("ping", {}, async () => ({
      content: [{ text: "pong", type: "text" }],
    }));
    const posthog = {
      capture: (event: (typeof captures)[number]) => captures.push(event),
      getLibraryId: () => "posthog-node",
      getLibraryVersion: () => "5.35.5",
    } as unknown as PostHog;
    instrumentMcpServer(server, posthog, "user_123");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    await client.callTool({ name: "ping" });
    await Bun.sleep(0);

    expect(
      captures.find(
        (event) => event.event === PostHogMCPAnalyticsEvent.ToolCall,
      ),
    ).toMatchObject({
      distinctId: "user_123",
      properties: {
        [PostHogMCPAnalyticsProperty.ToolName]: "ping",
      },
    });
    await client.close();
    await server.close();
  });

  it("removes user-controlled content from captured events", async () => {
    const options = mcpAnalyticsOptions("user_123");
    const event = {
      distinct_id: "user_123",
      event: PostHogMCPAnalyticsEvent.ToolCall,
      properties: {
        [PostHogMCPAnalyticsProperty.DurationMs]: 12,
        [PostHogMCPAnalyticsProperty.ErrorMessage]: "private search query",
        [PostHogMCPAnalyticsProperty.Intent]: "read private document",
        [PostHogMCPAnalyticsProperty.IntentSource]: "context_parameter",
        [PostHogMCPAnalyticsProperty.Parameters]: {
          query: "private search query",
        },
        [PostHogMCPAnalyticsProperty.Response]: {
          content: "private document",
        },
        [PostHogMCPAnalyticsProperty.ToolName]: "search_resources",
      },
      timestamp: new Date().toISOString(),
      type: "capture" as const,
    };

    const sanitized = await options.beforeSend?.(event);

    expect(sanitized?.properties).toEqual({
      [PostHogMCPAnalyticsProperty.DurationMs]: 12,
      [PostHogMCPAnalyticsProperty.ToolName]: "search_resources",
    });
  });
});
