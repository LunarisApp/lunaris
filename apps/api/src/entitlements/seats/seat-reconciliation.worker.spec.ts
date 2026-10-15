import { describe, expect, it, mock } from "bun:test";
import { SeatReconciliationWorker } from "./seat-reconciliation.worker";

function makeWorker(
  acquired: boolean,
  reconcileAllMemberSeats = mock(async () => ({
    checked: 2,
    failed: 0,
    updated: 1,
  })),
  unlockError?: Error,
) {
  const query = mock(async (statement: string) => {
    if (statement.includes("pg_advisory_unlock") && unlockError) {
      throw unlockError;
    }
    return {
      rows: statement.includes("pg_try_advisory_lock") ? [{ acquired }] : [],
    };
  });
  const release = mock(() => undefined);
  const worker = new SeatReconciliationWorker(
    {
      pool: {
        connect: mock(async () => ({ query, release })),
      },
    } as never,
    { reconcileAllMemberSeats } as never,
    { reconcileSubscriptions: mock(async () => ({ checked: 2, failed: 0 })) } as never,
  );

  return { query, reconcileAllMemberSeats, release, worker };
}

describe("SeatReconciliationWorker", () => {
  it("reconciles while holding one connection-scoped advisory lock", async () => {
    const { query, reconcileAllMemberSeats, release, worker } =
      makeWorker(true);

    await worker.reconcile();

    expect(reconcileAllMemberSeats).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("pg_try_advisory_lock");
    expect(query.mock.calls[1]?.[0]).toContain("pg_advisory_unlock");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("skips when another replica holds the reconciliation lock", async () => {
    const { query, reconcileAllMemberSeats, release, worker } =
      makeWorker(false);

    await worker.reconcile();

    expect(reconcileAllMemberSeats).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("unlocks and releases the connection when reconciliation fails", async () => {
    const reconcileAllMemberSeats = mock(async () => {
      throw new Error("database unavailable");
    });
    const { query, release, worker } = makeWorker(
      true,
      reconcileAllMemberSeats,
    );

    await expect(worker.reconcile()).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("pg_advisory_unlock");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("destroys the pooled connection when advisory unlock fails", async () => {
    const unlockError = new Error("unlock failed");
    const { release, worker } = makeWorker(
      true,
      undefined,
      unlockError,
    );

    await expect(worker.reconcile()).resolves.toBeUndefined();

    expect(release).toHaveBeenCalledWith(unlockError);
  });
});
