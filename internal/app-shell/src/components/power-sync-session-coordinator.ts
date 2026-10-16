import type { PowerSyncSession } from "@repo/data/core";

export class PowerSyncSessionCoordinator {
  private activeSession: PowerSyncSession | null = null;
  private transition = Promise.resolve();

  activate(session: PowerSyncSession) {
    this.activeSession = session;
  }

  clearActive() {
    this.activeSession = null;
  }

  create(factory: () => Promise<PowerSyncSession>) {
    return this.transition.then(factory);
  }

  getActive() {
    return this.activeSession;
  }

  release(creation: Promise<PowerSyncSession>) {
    const cleanup = creation.then(
      async (created) => {
        if (this.activeSession === created) {
          this.activeSession = null;
        }
        await created.close();
      },
      () => undefined
    );
    this.transition = cleanup;
    void cleanup.catch(() => undefined);
    return cleanup;
  }
}

export const powerSyncSessionCoordinator = new PowerSyncSessionCoordinator();

export function getActivePowerSyncSession() {
  return powerSyncSessionCoordinator.getActive();
}

export function clearActivePowerSyncSession() {
  powerSyncSessionCoordinator.clearActive();
}
