import { describe, expect, it } from "bun:test";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { createAuthClient, LAST_LOGIN_METHOD_COOKIE_NAME } from "./client";

describe("createAuthClient", () => {
  it("exposes a stable function name for development diagnostics", () => {
    const client = createAuthClient({ baseURL: "http://localhost:3000" });

    expect(client.name).toBe("LunarisAuthClient");
  });

  it("enables passkeys by default", () => {
    const client = createAuthClient({ baseURL: "http://localhost:3000" });

    expect(client.supportsPasskeys()).toBe(true);
  });

  it("can disable passkeys for desktop clients", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
      passkeys: false,
    });

    expect(client.supportsPasskeys()).toBe(false);
  });

  it("exposes multi-session account actions", () => {
    const client = createAuthClient({ baseURL: "http://localhost:3000" });

    expect(client.multiSession.listDeviceSessions).toBeFunction();
    expect(client.multiSession.setActive).toBeFunction();
    expect(client.multiSession.revoke).toBeFunction();
  });

  it("exposes organization team actions", () => {
    const client = createAuthClient({ baseURL: "http://localhost:3000" });

    expect(client.organization.createTeam).toBeFunction();
    expect(client.organization.listTeams).toBeFunction();
    expect(client.organization.addTeamMember).toBeFunction();
  });

  it("infers actions from configured plugins", () => {
    const plugin = {
      id: "test-client-actions",
      getActions: () => ({
        getPluginValue: () => "configured",
      }),
    } satisfies BetterAuthClientPlugin;
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
      plugins: [plugin],
    });

    expect(client.getPluginValue()).toBe("configured");
  });

  it("reads the configured last login method cookie", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      "document"
    );
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { cookie: `${LAST_LOGIN_METHOD_COOKIE_NAME}=email` },
    });

    try {
      const client = createAuthClient({ baseURL: "http://localhost:3000" });

      expect(client.getLastUsedLoginMethod()).toBe("email");
      expect(client.isLastUsedLoginMethod("email")).toBe(true);
    } finally {
      if (originalDocument) {
        Object.defineProperty(globalThis, "document", originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, "document");
      }
    }
  });
});
