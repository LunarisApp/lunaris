import {
  DEFAULT_REGION_DIRECTORY_URL,
  parseRegionDirectory,
} from "@repo/features/region";
import { createBrowserPlatform } from "@repo/platform";
import { z } from "zod";
import { createEnv } from "./lib/create-env";

const EnvSchema = z.object({
  REGION_DIRECTORY_JSON: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) {
        return;
      }
      try {
        return parseRegionDirectory(JSON.parse(value));
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof Error ? error.message : "Invalid region directory",
        });
        return z.NEVER;
      }
    }),
  REGION_DIRECTORY_URL: z.string().url().default(DEFAULT_REGION_DIRECTORY_URL),

  POSTHOG_URL: z.string().url().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_ORG: z.string().optional(),
  POSTHOG_WORKSPACE_ID: z
    .string()
    .regex(/^\d+$/)
    .transform((val) => Number.parseInt(val, 10))
    .optional(),

  SENTRY_DSN: z.string().optional(),
});

const env = createEnv(EnvSchema, {
  // Explicit build-time directories support local development and E2E builds.
  // Production releases omit this value and discover regions from the URL.
  REGION_DIRECTORY_JSON:
    import.meta.env.DEV ||
    import.meta.env.VITE_ALLOW_INLINE_REGION_DIRECTORY === "true"
      ? import.meta.env.VITE_REGION_DIRECTORY_JSON
      : undefined,
  REGION_DIRECTORY_URL: import.meta.env.VITE_REGION_DIRECTORY_URL?.startsWith(
    "/"
  )
    ? new URL(
        import.meta.env.VITE_REGION_DIRECTORY_URL,
        createBrowserPlatform({ kind: "web" }).navigation.origin()
      ).href
    : import.meta.env.VITE_REGION_DIRECTORY_URL,
  POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
  POSTHOG_ORG: import.meta.env.VITE_POSTHOG_ORG,
  POSTHOG_WORKSPACE_ID: import.meta.env.VITE_POSTHOG_WORKSPACE_ID,
  POSTHOG_URL: import.meta.env.VITE_POSTHOG_URL,
  SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
}) as z.TypeOf<typeof EnvSchema>;
export default env;

// const isDev = env.ENV == "development";
// const isProd = env.ENV == "production";
// export { isDev, isProd };
