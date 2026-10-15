export type YjsPersistenceState = "error" | "idle" | "persisting";

type YjsPersistenceStateListener = (state: YjsPersistenceState) => void;

interface YjsPersistenceWaiter {
  reject: (error: Error) => void;
  resolve: () => void;
}

export class YjsPersistenceTracker {
  private readonly listeners = new Set<YjsPersistenceStateListener>();
  private readonly waiters = new Set<YjsPersistenceWaiter>();
  private pendingWrites = 0;
  private error: Error | null = null;

  getState(): YjsPersistenceState {
    if (this.error) return "error";
    return this.pendingWrites > 0 ? "persisting" : "idle";
  }

  startWrite(): void {
    const previousState = this.getState();
    this.pendingWrites++;
    this.notifyIfChanged(previousState);
  }

  failWrite(cause: unknown): Error | null {
    if (this.error) return null;

    this.error = cause instanceof Error ? cause : new Error(String(cause));
    this.notifyListeners();
    this.settleWaiters();
    return this.error;
  }

  completeWrite(): void {
    const previousState = this.getState();
    this.pendingWrites--;
    this.notifyIfChanged(previousState);
    this.settleWaiters();
  }

  subscribe(listener: YjsPersistenceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  wait(): Promise<void> {
    if (this.error) return Promise.reject(this.error);
    if (this.pendingWrites === 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      this.waiters.add({ resolve, reject });
    });
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  private notifyIfChanged(previousState: YjsPersistenceState): void {
    if (previousState !== this.getState()) this.notifyListeners();
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  private settleWaiters(): void {
    if (!this.error && this.pendingWrites > 0) return;

    for (const waiter of this.waiters) {
      if (this.error) waiter.reject(this.error);
      else waiter.resolve();
    }
    this.waiters.clear();
  }
}
