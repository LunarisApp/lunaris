import { describe, expect, it, vi } from "vitest";
import { activateAccountSession } from "./use-account-switcher";

function createPowerSyncSession() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue(undefined),
  };
}

describe("activateAccountSession", () => {
  it("disconnects sync and preserves cached data while switching", async () => {
    const events: string[] = [];
    const powerSyncSession = createPowerSyncSession();
    powerSyncSession.disconnect.mockImplementation(async () => {
      events.push("disconnect");
    });
    const setActive = vi.fn().mockImplementation(async () => {
      events.push("set-active");
      return { data: { session: { id: "session-2" } }, error: null };
    });

    await activateAccountSession({
      authClient: { multiSession: { setActive } } as never,
      beforeSwitch: () => {
        events.push("leave-organization");
      },
      powerSyncSession: powerSyncSession as never,
      sessionToken: "token-2",
    });

    expect(events).toEqual(["leave-organization", "disconnect", "set-active"]);
    expect(powerSyncSession.purge).not.toHaveBeenCalled();
    expect(powerSyncSession.connect).not.toHaveBeenCalled();
  });

  it("reconnects the current account when switching is rejected", async () => {
    const powerSyncSession = createPowerSyncSession();
    const error = { message: "invalid session" };

    await expect(
      activateAccountSession({
        authClient: {
          multiSession: {
            setActive: vi.fn().mockResolvedValue({ data: null, error }),
          },
        } as never,
        powerSyncSession: powerSyncSession as never,
        sessionToken: "invalid",
      }),
    ).resolves.toEqual({ data: null, error });

    expect(powerSyncSession.disconnect).toHaveBeenCalledOnce();
    expect(powerSyncSession.connect).toHaveBeenCalledOnce();
    expect(powerSyncSession.purge).not.toHaveBeenCalled();
  });
});
