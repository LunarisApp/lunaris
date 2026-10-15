import { randomBytes } from "node:crypto";
import type { Auth } from "./server";

/** Local administration only. Never expose this helper through an HTTP route. */
export async function resetLocalPassword(auth: Auth, email: string, password: string) {
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserByEmail(email.trim().toLowerCase(), { includeAccounts: true });
  if (!found || !found.accounts.some((account) => account.providerId === "credential" && account.password)) {
    throw new Error("No password account found for that email.");
  }
  const token = randomBytes(32).toString("hex");
  const identifier = `reset-password:${token}`;
  await context.internalAdapter.createVerificationValue({
    identifier,
    value: found.user.id,
    expiresAt: new Date(Date.now() + 60_000),
  });
  try {
    await auth.api.resetPassword({ body: { token, newPassword: password } });
    return found.user.id;
  } finally {
    await context.internalAdapter.deleteVerificationByIdentifier(identifier);
  }
}
