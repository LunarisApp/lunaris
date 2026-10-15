import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { scrubTelemetryProperties } from "@repo/utils";
import { type EventMessage, PostHog } from "posthog-node";
import { PostHogConfig } from "./posthog.config";

export const POSTHOG_CLIENT = "POSTHOG_CLIENT";
export const POSTHOG_MCP_CLIENT = "POSTHOG_MCP_CLIENT";

@Injectable()
class PostHogLifecycleService implements OnApplicationShutdown {
  constructor(
    @Inject(POSTHOG_CLIENT) private readonly posthog: PostHog | null,
    @Inject(POSTHOG_MCP_CLIENT) private readonly mcpPosthog: PostHog | null,
  ) {}

  async onApplicationShutdown() {
    await Promise.all([
      this.posthog?.shutdown(),
      this.mcpPosthog?.shutdown(),
    ]);
  }
}

type PostHogSource = "application" | "mcp";

export function sanitizePostHogEvent(
  event: EventMessage | null,
  source: PostHogSource,
): EventMessage | null {
  if (!event) return null;
  const commitHash = process.env.RAILWAY_GIT_COMMIT_SHA;
  const properties = scrubTelemetryProperties(event.properties) ?? {};
  delete properties.$ip;
  return {
    ...event,
    properties: {
      ...properties,
      app_surface: "api",
      environment: process.env.NODE_ENV ?? "development",
      telemetry_source: source,
      ...(commitHash ? { app_version: commitHash.slice(0, 7) } : {}),
    },
  };
}

function createPostHogClient(
  config: PostHogConfig,
  source: PostHogSource,
): PostHog | null {
  if (!config.key) return null;
  return new PostHog(config.key, {
    before_send: (event) => sanitizePostHogEvent(event, source),
    disableGeoip: true,
    enableExceptionAutocapture: false,
    host: config.apiHost,
  });
}

@Global()
@Module({
	providers: [
		{
			provide: POSTHOG_CLIENT,
			inject: [PostHogConfig],
			useFactory: (config: PostHogConfig) =>
				createPostHogClient(config, "application"),
		},
		{
			provide: POSTHOG_MCP_CLIENT,
			inject: [PostHogConfig],
			useFactory: (config: PostHogConfig) =>
				createPostHogClient(config, "mcp"),
		},
		PostHogLifecycleService,
	],
	exports: [POSTHOG_CLIENT, POSTHOG_MCP_CLIENT],
})
export class PostHogModule {}
