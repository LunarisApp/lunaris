import type { McpServer } from "@modelcontextprotocol/server";
import {
  type BeforeSendFn,
  instrument,
  type MCPAnalyticsOptions,
  PostHogMCPAnalyticsProperty,
} from "@posthog/mcp";
import type { PostHog } from "posthog-node";

const redactMcpPayloads: BeforeSendFn = (event) => {
  delete event.properties[PostHogMCPAnalyticsProperty.Parameters];
  delete event.properties[PostHogMCPAnalyticsProperty.Response];
  delete event.properties[PostHogMCPAnalyticsProperty.ErrorMessage];
  delete event.properties[PostHogMCPAnalyticsProperty.Intent];
  delete event.properties[PostHogMCPAnalyticsProperty.IntentSource];
  return event;
};

export function mcpAnalyticsOptions(actorId: string): MCPAnalyticsOptions {
  return {
    beforeSend: redactMcpPayloads,
    context: false,
    enableExceptionAutocapture: false,
    identify: { distinctId: actorId },
  };
}

export function instrumentMcpServer(
  server: McpServer,
  posthog: PostHog | null,
  actorId: string
) {
  if (!posthog) {
    return;
  }
  // @posthog/mcp still checks for v1's removed McpServer.tool() helper.
  // Its low-level Server instrumentation works with both SDK generations.
  instrument(server.server, posthog, mcpAnalyticsOptions(actorId));
}
