import { describe, expect, it } from "vitest";
import { createSyncBlocker } from "./sync-blocker";

describe("createSyncBlocker", () => {
  it("blocks after three consecutive client errors", () => {
    const blocker = createSyncBlocker();

    blocker.recordClientError(409);
    blocker.recordClientError(409);
    blocker.recordClientError(409);

    expect(blocker.getSnapshot()).toEqual({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 409,
    });
  });

  it("resets consecutive errors after success", () => {
    const blocker = createSyncBlocker();

    blocker.recordClientError(409);
    blocker.recordSuccess();

    expect(blocker.getSnapshot()).toEqual({
      blocked: false,
      consecutiveClientErrors: 0,
      lastClientErrorStatus: null,
    });
  });

  it("resets consecutive errors after a non-client error", () => {
    const blocker = createSyncBlocker();

    blocker.recordClientError(409);
    blocker.recordNonClientError();

    expect(blocker.getSnapshot()).toEqual({
      blocked: false,
      consecutiveClientErrors: 0,
      lastClientErrorStatus: null,
    });
  });
});
