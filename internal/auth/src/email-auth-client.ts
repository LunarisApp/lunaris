import type { BetterAuthClientPlugin } from "better-auth/client";
import {
  type EmailAuthResolution,
  RESOLVE_EMAIL_METHOD_PATH,
} from "./email-auth-shared";

export function emailAuthDiscoveryClient() {
  return {
    id: "lunaris-email-auth-discovery-client",
    getActions: ($fetch) => ({
      resolveEmailMethod: (email: string) =>
        $fetch<EmailAuthResolution>(RESOLVE_EMAIL_METHOD_PATH, {
          body: { email },
          method: "POST",
        }),
    }),
  } satisfies BetterAuthClientPlugin;
}
