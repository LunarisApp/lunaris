/** @vitest-environment happy-dom */

import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PowerSyncProvider } from "./provider";
import type { PowerSyncSession } from "./session";
import { createSyncBlocker } from "./sync-blocker";

function makeSession(): PowerSyncSession {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    database: {
      registerListener: vi.fn(() => vi.fn()),
    } as never,
    disconnect: vi.fn().mockResolvedValue(undefined),
    estimateStorage: vi.fn().mockResolvedValue({ quota: null, usage: 0 }),
    purge: vi.fn().mockResolvedValue(undefined),
    storageName: "lunaris.v2.test.db",
  };
}

function renderProvider(
  session: PowerSyncSession,
  syncAccess: "cloud" | "local-only" = "cloud"
) {
  const syncBlocker = createSyncBlocker();
  const view = render(
    <PowerSyncProvider
      session={session}
      syncAccess={syncAccess}
      syncBlocker={syncBlocker}
    >
      <div>child</div>
    </PowerSyncProvider>
  );
  return { syncBlocker, view };
}

describe("PowerSyncProvider", () => {
  it("connects cloud sessions", async () => {
    const session = makeSession();
    renderProvider(session);
    await waitFor(() => expect(session.connect).toHaveBeenCalledOnce());
  });

  it("keeps local-only sessions disconnected", async () => {
    const session = makeSession();
    renderProvider(session, "local-only");
    await waitFor(() => expect(session.disconnect).toHaveBeenCalled());
    expect(session.connect).not.toHaveBeenCalled();
  });

  it("disconnects when blocked and reconnects after resume", async () => {
    const session = makeSession();
    const { syncBlocker } = renderProvider(session);
    await waitFor(() => expect(session.connect).toHaveBeenCalledOnce());

    act(() => {
      syncBlocker.recordClientError(409);
      syncBlocker.recordClientError(409);
      syncBlocker.recordClientError(409);
    });
    await waitFor(() => expect(session.disconnect).toHaveBeenCalled());

    act(() => syncBlocker.resume());
    await waitFor(() => expect(session.connect).toHaveBeenCalledTimes(2));
  });

  it("cleans up status listener", async () => {
    const dispose = vi.fn();
    const session = makeSession();
    vi.mocked(session.database.registerListener).mockReturnValue(dispose);
    const { view } = renderProvider(session);
    await waitFor(() =>
      expect(session.database.registerListener).toHaveBeenCalledOnce()
    );
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
