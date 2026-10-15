import { describe, expect, it, vi } from "vitest";
import type { AwarenessChannels } from "../host/awareness-channels";
import {
  assertNoPresenceTicketRequest,
  createPresenceCapabilities,
} from "./presence-capabilities";

describe("renderer presence capabilities", () => {
  it("preserves ownership after a rejected duplicate and isolates subscriptions", () => {
    const channels = { open: vi.fn(), close: vi.fn(), update: vi.fn() };
    const owned = new Set<string>();
    const capabilities = createPresenceCapabilities(
      channels as unknown as AwarenessChannels,
      "example.board",
      { content: { kind: "yjs", storageId: "slot" } },
      owned,
      () => {},
    );
    capabilities["presence.open"]("one", { channel: "selection" });
    expect(() =>
      capabilities["presence.open"]("one", { channel: "pointer" }),
    ).toThrow("Duplicate");
    expect(owned.has("one")).toBe(true);
    expect(channels.open).toHaveBeenCalledTimes(1);
    capabilities["presence.update"]("one", null);
    expect(channels.update).toHaveBeenCalledWith("one", null);
    expect(() => capabilities["presence.update"]("foreign", null)).toThrow(
      "scope",
    );
    expect(() =>
      capabilities["presence.open"]("bad", {
        storageId: "foreign",
        clientId: 7,
      }),
    ).toThrow("scope");
    capabilities["presence.close"]("foreign");
    expect(channels.close).not.toHaveBeenCalled();
    capabilities["presence.close"]("one");
    expect(channels.close).toHaveBeenCalledWith("one");
    expect(owned.size).toBe(0);
  });
  it("rolls back ownership when a new subscription fails", () => {
    const owned = new Set<string>();
    const channels = {
      open: () => {
        throw new Error("capacity");
      },
    };
    const capabilities = createPresenceCapabilities(
      channels as unknown as AwarenessChannels,
      "example.board",
      {},
      owned,
      () => {},
    );
    expect(() =>
      capabilities["presence.open"]("one", { channel: "selection" }),
    ).toThrow("capacity");
    expect(owned.size).toBe(0);
  });
  it("blocks presence transport through both relative and absolute fetch inputs", () => {
    const base = "https://api.example.com";
    for (const input of [
      "/v1/workspaces/w/resources/r/presence/ticket",
      new URL(`${base}/v1/workspaces/w/storage/s/presence/ticket?x=1`),
      new Request(`${base}/v1/workspaces/w/resources/r/%70resence/ticket/`),
    ]) {
      expect(() => assertNoPresenceTicketRequest(input, base)).toThrow(
        "host-only",
      );
    }
    expect(() =>
      assertNoPresenceTicketRequest("/v1/workspaces/w/resources/r", base),
    ).not.toThrow();
  });
});
