import { serverManifestSchema } from "@repo/agent-contracts";
import type { infer as Infer } from "zod";
import { z } from "zod";

export const manifestResponseSchema = serverManifestSchema.extend({
  auth: z.literal("oauth"),
  signupsAllowed: z.boolean(),
  capabilities: z.object({ passwordResetEmail: z.boolean() }),
  socialProviders: z.array(z.enum(["google"])),
  regionId: z.string().min(1),
  storageUrl: z.url(),
  syncUrl: z.url(),
});

export const ManifestResponseDto = manifestResponseSchema.meta({
  id: "ManifestResponseDto",
});
export type ManifestResponseDto = Infer<typeof ManifestResponseDto>;
