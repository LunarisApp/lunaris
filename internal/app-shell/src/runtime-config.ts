import { z } from "zod";

export const buildVersionHeader = "X-Lunaris-Version";
export const buildRevisionHeader = "X-Lunaris-Commit";

const url = z.string().url().optional();
export const publicRuntimeConfigSchema = z
  .object({
    REGION_DIRECTORY_URL: z
      .string()
      .refine(
        (value) =>
          (value.startsWith("/") && !value.startsWith("//")) ||
          URL.canParse(value)
      )
      .optional(),
    POSTHOG_KEY: z.string().optional(),
    POSTHOG_API_HOST: url,
    POSTHOG_UI_HOST: url,
    POSTHOG_URL: url,
    POSTHOG_ORG: z.string().optional(),
    POSTHOG_WORKSPACE_ID: z.string().regex(/^\d+$/).optional(),
    SENTRY_DSN: url,
    PROBO_COOKIE_BANNER_ID: z.string().optional(),
    PROBO_COOKIE_BANNER_BASE_URL: url,
  })
  .strict();
export type PublicRuntimeConfig = z.infer<typeof publicRuntimeConfigSchema>;
const runtime = globalThis as typeof globalThis & {
  __LUNARIS_RUNTIME_CONFIG__?: PublicRuntimeConfig;
};
let runtimeBuildVersion: string | undefined;

export const getPublicRuntimeConfig = () => runtime.__LUNARIS_RUNTIME_CONFIG__;
export const getRuntimeBuildVersion = () => runtimeBuildVersion;
export function setPublicRuntimeConfig(
  config?: PublicRuntimeConfig,
  buildVersion?: string
) {
  runtime.__LUNARIS_RUNTIME_CONFIG__ = config
    ? publicRuntimeConfigSchema.parse(config)
    : undefined;
  runtimeBuildVersion = buildVersion;
}

/** Explicit allowlist: never serialize process.env into a browser response. */
export function publicConfigFromEnvironment(
  environment: Record<string, string | undefined>
): PublicRuntimeConfig {
  return publicRuntimeConfigSchema.parse(
    Object.fromEntries(
      Object.keys(publicRuntimeConfigSchema.shape).flatMap((key) => {
        const value = environment[`VITE_${key}`];
        return value ? [[key, value]] : [];
      })
    )
  );
}
