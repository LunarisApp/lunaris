import { describe, expect, it } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { resetLocalPassword } from "./admin-password";
import { createAuth } from "./server";

function fixture() {
  return createAuth({} as never, {
    database: memoryAdapter({ oauthResource: [], oauthAccessToken: [], oauthRefreshToken: [], oauthClient: [], user: [], account: [], session: [], verification: [] }),
    frontendUrl: "https://example.com",
    backendUrl: "https://example.com",
  });
}

describe("local password recovery", () => {
  it("rejects missing and social-only accounts", async () => {
    const auth = fixture();
    await expect(resetLocalPassword(auth, "missing@example.com", "new-password")).rejects.toThrow("No password account");
    const ctx = await auth.$context;
    await ctx.internalAdapter.createUser({ email: "social@example.com", name: "Social", emailVerified: true }, { method: "admin" });
    await expect(resetLocalPassword(auth, "social@example.com", "new-password")).rejects.toThrow("No password account");
  });
  it("changes the credential and revokes sessions through Better Auth", async () => {
    const auth = fixture();
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser({ email: "person@example.com", name: "Person", emailVerified: true }, { method: "admin" });
    await ctx.internalAdapter.createAccount({ userId: user.id, accountId: user.id, providerId: "credential", issuer: "local:credential", password: await ctx.password.hash("old-password") });
    const session = await ctx.internalAdapter.createSession(user.id);
    await expect(resetLocalPassword(auth, "person@example.com", "short")).rejects.toBeDefined();
    expect(await ctx.internalAdapter.findSession(session.token)).not.toBeNull();
    await resetLocalPassword(auth, " PERSON@example.com ", "new-password");
    const accounts = await ctx.internalAdapter.findAccounts(user.id);
    expect(await ctx.password.verify({ hash: accounts[0]!.password!, password: "new-password" })).toBe(true);
    expect(await ctx.password.verify({ hash: accounts[0]!.password!, password: "old-password" })).toBe(false);
    expect(await ctx.internalAdapter.findSession(session.token)).toBeNull();
  });
  it("rejects email recovery without delivery configured", async () => {
    const auth = fixture();
    const response = await auth.handler(new Request("https://example.com/auth/request-password-reset", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://example.com" },
      body: JSON.stringify({ email: "person@example.com" }),
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_RECOVERY_DISABLED" });
  });
});
