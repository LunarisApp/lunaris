import { emailAuthResolutionSchema } from "@repo/auth/client";
import { z } from "zod";

const continuationStateSchema = z.object({
  email: z.string().email(),
  resolution: emailAuthResolutionSchema,
});

export type EmailAuthContinuationState = z.infer<
  typeof continuationStateSchema
>;

export function parseEmailAuthContinuationState(
  state: unknown
): EmailAuthContinuationState | null {
  const result = continuationStateSchema.safeParse(state);
  return result.success ? result.data : null;
}

export function getEmailPrefill(state: unknown) {
  if (!state || typeof state !== "object" || !("email" in state)) {
    return "";
  }
  const result = z.string().email().safeParse(state.email);
  return result.success ? result.data : "";
}
