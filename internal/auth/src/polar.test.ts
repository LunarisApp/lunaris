import { createHmac } from "node:crypto";
import { describe, expect, it, mock, spyOn } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "./server";

const secret = "test-polar-webhook-secret";

function request(body: string, signedBody = body) {
  const id = "webhook-test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${signedBody}`)
    .digest("base64");
  return new Request("http://localhost:3000/auth/polar/webhooks", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
  });
}

function fixture(
  onSubscriptionCreated = mock(async (_event: unknown) => undefined),
  signupsAllowed = true
) {
  const storage = {
    user: [] as Record<string, unknown>[],
    session: [],
    account: [],
    verification: [],
    oauthResource: [],
    organization: [],
    member: [],
    invitation: [],
  };
  const auth = createAuth({} as never, {
    frontendUrl: "http://localhost:5173",
    backendUrl: "http://localhost:3000",
    database: memoryAdapter(storage),
    disableEmailVerification: true,
    signupsAllowed,
    polarConfig: {
      accessToken: "test-token",
      sandbox: true,
      webhookSecret: secret,
      webhookCallbacks: { onSubscriptionCreated },
    },
  });
  return { auth, onSubscriptionCreated, storage };
}

const payload = JSON.stringify({
  type: "subscription.created",
  api_version: "2026-10",
  timestamp: "2026-10-01T00:00:00Z",
  data: {
    id: "subscription-1",
    created_at: "2026-10-01T00:00:00Z",
    modified_at: null,
    customer: { external_id: "owner-1" },
    metadata: { referenceId: "organization-1" },
  },
});

describe("Polar 2 webhook adapter", () => {
  it("verifies the raw body and forwards snake_case payloads unchanged", async () => {
    const { auth, onSubscriptionCreated } = fixture();
    const response = await auth.handler(request(payload));
    expect(response.status).toBe(200);
    expect(onSubscriptionCreated).toHaveBeenCalledWith(JSON.parse(payload));
  });

  it("rejects a tampered payload before invoking billing callbacks", async () => {
    const { auth, onSubscriptionCreated } = fixture();
    const response = await auth.handler(
      request(payload.replace("owner-1", "attacker"), payload)
    );
    expect(response.status).toBe(403);
    expect(onSubscriptionCreated).not.toHaveBeenCalled();
  });
});

describe("Polar 2 signup customer linking", () => {
  it("creates a customer only after inserting the user and keeps its external ID", async () => {
    const { auth, storage } = fixture();
    const calls: Record<string, unknown>[] = [];
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (
          _url: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1]
        ) => {
          if (init?.method === "POST") {
            const body = JSON.parse(init.body as string);
            expect(
              storage.user.some((user) => user.id === body.external_id)
            ).toBe(true);
            calls.push(body);
            return Response.json({ id: "customer-1", ...body });
          }
          return Response.json({ items: [] });
        },
        { preconnect: fetch.preconnect }
      )
    );
    try {
      const response = await auth.handler(
        new Request("http://localhost:3000/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:5173",
          },
          body: JSON.stringify({
            email: "polar-signup@example.test",
            name: "Polar signup",
            password: "Polar-test-password-123",
          }),
        })
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(calls).toEqual([
        {
          email: "polar-signup@example.test",
          name: "Polar signup",
          external_id: body.user.id,
        },
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("does not contact Polar when signup is disabled", async () => {
    const { auth } = fixture(undefined, false);
    const fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Unexpected Polar call")
    );
    try {
      const response = await auth.handler(
        new Request("http://localhost:3000/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:5173",
          },
          body: JSON.stringify({
            email: "blocked@example.test",
            name: "Blocked",
            password: "Polar-test-password-123",
          }),
        })
      );
      expect(response.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
