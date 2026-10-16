import { describe, expect, it } from "vitest";
import {
  type ResolveSyncStatusInput,
  resolveSyncStatus,
} from "./resolve-status";

const baseInput: ResolveSyncStatusInput = {
  syncAccess: "cloud",
  blocked: false,
  lastClientErrorStatus: null,
  connected: true,
  connecting: false,
  lastSyncedAt: undefined,
  networkOnline: true,
  uploadError: undefined,
  downloadError: undefined,
};

describe("resolveSyncStatus", () => {
  it("returns local-only-anonymous for anonymous user without cloud access", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        syncAccess: "local-only",
      })
    ).toEqual({ kind: "local-only-anonymous", lastSyncedAt: undefined });
  });

  it("prefers local-only over connectivity state", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        syncAccess: "local-only",
        connected: false,
        connecting: true,
      })
    ).toEqual({ kind: "local-only-anonymous", lastSyncedAt: undefined });
  });

  it("preserves lastSyncedAt on local-only variants", () => {
    const lastSyncedAt = new Date("2026-04-07T00:00:00Z");
    expect(
      resolveSyncStatus({
        ...baseInput,
        syncAccess: "local-only",
        lastSyncedAt,
      })
    ).toEqual({ kind: "local-only-anonymous", lastSyncedAt });
  });

  it("returns blocked-auth when blocked with 401 status", () => {
    const lastSyncedAt = new Date("2026-04-07T00:00:00Z");
    expect(
      resolveSyncStatus({
        ...baseInput,
        blocked: true,
        lastClientErrorStatus: 401,
        connected: false,
        lastSyncedAt,
      })
    ).toEqual({ kind: "blocked-auth", lastSyncedAt });
  });

  it("returns blocked-permission when blocked with 403 status", () => {
    const lastSyncedAt = new Date("2026-04-07T00:00:00Z");
    expect(
      resolveSyncStatus({
        ...baseInput,
        blocked: true,
        lastClientErrorStatus: 403,
        connected: false,
        lastSyncedAt,
      })
    ).toEqual({ kind: "blocked-permission", lastSyncedAt });
  });

  it("returns blocked-generic for other blocking client errors", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        blocked: true,
        lastClientErrorStatus: 409,
        connected: false,
      })
    ).toEqual({ kind: "blocked-generic", lastSyncedAt: undefined });
  });

  it("returns blocked-generic when blocked with no recorded status", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        blocked: true,
        lastClientErrorStatus: null,
        connected: false,
      })
    ).toEqual({ kind: "blocked-generic", lastSyncedAt: undefined });
  });

  it("returns transient-error for upload errors while still connected", () => {
    const lastSyncedAt = new Date("2026-04-07T00:00:00Z");
    expect(
      resolveSyncStatus({
        ...baseInput,
        connected: true,
        uploadError: new Error("Server returned 502"),
        lastSyncedAt,
      })
    ).toEqual({
      kind: "transient-error",
      reason: "Server returned 502",
      lastSyncedAt,
    });
  });

  it("falls back to downloadError when uploadError is absent", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        connected: true,
        downloadError: new Error("download timeout"),
      })
    ).toEqual({
      kind: "transient-error",
      reason: "download timeout",
      lastSyncedAt: undefined,
    });
  });

  it("treats blank error messages as missing reason", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        connected: true,
        // biome-ignore lint/suspicious/useErrorMessage: Blank error message is the input under test.
        uploadError: new Error("   "),
      })
    ).toEqual({
      kind: "transient-error",
      reason: undefined,
      lastSyncedAt: undefined,
    });
  });

  it("does not surface transient errors when disconnected (offline takes over)", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        connected: false,
        connecting: false,
        uploadError: new Error("network down"),
      })
    ).toEqual({ kind: "offline", lastSyncedAt: undefined });
  });

  it("returns online when connected with no errors", () => {
    expect(resolveSyncStatus(baseInput)).toEqual({
      kind: "online",
      lastSyncedAt: undefined,
    });
  });

  it("returns offline when browser loses connectivity before sync disconnects", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        networkOnline: false,
      })
    ).toEqual({ kind: "offline", lastSyncedAt: undefined });
  });

  it("preserves lastSyncedAt on online", () => {
    const lastSyncedAt = new Date("2026-04-07T00:00:00Z");
    expect(resolveSyncStatus({ ...baseInput, lastSyncedAt })).toEqual({
      kind: "online",
      lastSyncedAt,
    });
  });

  it("returns connecting when handshake is in progress", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        connected: false,
        connecting: true,
      })
    ).toEqual({ kind: "connecting", lastSyncedAt: undefined });
  });

  it("preserves lastSyncedAt on connecting", () => {
    const lastSyncedAt = new Date("2026-04-07T00:00:00Z");
    expect(
      resolveSyncStatus({
        ...baseInput,
        connected: false,
        connecting: true,
        lastSyncedAt,
      })
    ).toEqual({ kind: "connecting", lastSyncedAt });
  });

  it("returns offline when disconnected and not connecting", () => {
    const lastSyncedAt = new Date("2026-04-07T00:00:00Z");
    expect(
      resolveSyncStatus({
        ...baseInput,
        connected: false,
        connecting: false,
        lastSyncedAt,
      })
    ).toEqual({ kind: "offline", lastSyncedAt });
  });

  it("blocked outranks transient error", () => {
    expect(
      resolveSyncStatus({
        ...baseInput,
        blocked: true,
        lastClientErrorStatus: 401,
        connected: true,
        uploadError: new Error("noise"),
      })
    ).toEqual({ kind: "blocked-auth", lastSyncedAt: undefined });
  });
});
