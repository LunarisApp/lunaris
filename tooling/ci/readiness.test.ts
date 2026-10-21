import { expect, test } from "bun:test";
import { waitForReady } from "./readiness";

test("readiness retries connection errors and unhealthy responses", async () => {
  let calls = 0;
  await waitForReady("http://fixture/health", {
    alive: () => true,
    intervalMs: 1,
    request: (async () => {
      calls++;
      if (calls === 1) {
        throw new Error("connection refused");
      }
      return new Response(null, { status: calls === 2 ? 503 : 200 });
    }) as (url: string, options?: RequestInit) => Promise<Response>,
  });
  expect(calls).toBe(3);
});

test("readiness distinguishes process exit from timeout", async () => {
  await expect(
    waitForReady("http://fixture/health", { alive: () => false })
  ).rejects.toThrow("Server exited");
  await expect(
    waitForReady("http://fixture/health", {
      alive: () => true,
      timeoutMs: 5,
      intervalMs: 1,
      request: (async () => new Response(null, { status: 503 })) as (
        url: string,
        options?: RequestInit
      ) => Promise<Response>,
    })
  ).rejects.toThrow("Readiness timed out");
});
