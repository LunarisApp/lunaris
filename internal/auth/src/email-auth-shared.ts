import * as z from "zod";

export const RESOLVE_EMAIL_METHOD_PATH = "/resolve-email-method";

export const socialAuthProviderSchema = z.enum(["google"]);

export type SocialAuthProvider = z.infer<typeof socialAuthProviderSchema>;

export const emailAuthResolutionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("password") }),
  z.object({ kind: z.literal("register") }),
  z.object({
    kind: z.literal("social"),
    provider: socialAuthProviderSchema,
  }),
]);

export type EmailAuthResolution = z.infer<typeof emailAuthResolutionSchema>;
