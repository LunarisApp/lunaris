/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDefaultWorkspaceSeedMarker,
  DEFAULT_WORKSPACE_SEED_MARKER_KEY,
  markDefaultWorkspaceSeedPending,
  readDefaultWorkspaceSeedMarker,
} from "./seed-marker";

describe("default workspace seed marker", () => {
  beforeEach(() => localStorage.clear());

  it("reads the current registered marker", () => {
    localStorage.setItem(
      DEFAULT_WORKSPACE_SEED_MARKER_KEY,
      JSON.stringify({ kind: "registered", email: "ada@example.com" }),
    );

    expect(readDefaultWorkspaceSeedMarker()).toEqual({
      kind: "registered",
      email: "ada@example.com",
    });
    expect(localStorage.getItem(DEFAULT_WORKSPACE_SEED_MARKER_KEY)).not.toBeNull();
  });

  it("writes and clears only the current marker", () => {
    markDefaultWorkspaceSeedPending({ kind: "anonymous" });

    expect(readDefaultWorkspaceSeedMarker()).toEqual({ kind: "anonymous" });

    clearDefaultWorkspaceSeedMarker();
    expect(localStorage.getItem(DEFAULT_WORKSPACE_SEED_MARKER_KEY)).toBeNull();
  });
});
