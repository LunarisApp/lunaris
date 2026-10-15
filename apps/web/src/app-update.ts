import { useRegisterSW } from "virtual:pwa-register/react";
import type { AppUpdateState } from "@repo/app-shell";
import { serializeErrorForLog } from "@repo/utils/log-error";
import { log } from "evlog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

type UpdateRegistration = Pick<
  ServiceWorkerRegistration,
  | "addEventListener"
  | "installing"
  | "removeEventListener"
  | "update"
  | "waiting"
>;

interface UpdateEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface UpdateCheckEnvironment {
  document: UpdateEventTarget & {
    visibilityState: DocumentVisibilityState;
  };
  navigator: {
    onLine: boolean;
  };
  window: UpdateEventTarget & {
    clearInterval(id: number): void;
    setInterval(handler: () => void, timeout: number): number;
  };
}

interface ControllerChangeTarget {
  addEventListener(type: "controllerchange", listener: EventListener): void;
  removeEventListener(type: "controllerchange", listener: EventListener): void;
}

export function createRunOnce(callback: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    callback();
  };
}

export function activateWaitingServiceWorker(
  worker: Pick<ServiceWorker, "postMessage">,
  serviceWorkers: ControllerChangeTarget,
  onControllerChange: () => void,
): () => void {
  let listening = true;
  const cleanup = () => {
    if (!listening) return;
    listening = false;
    serviceWorkers.removeEventListener(
      "controllerchange",
      handleControllerChange,
    );
  };
  const handleControllerChange = () => {
    cleanup();
    onControllerChange();
  };

  serviceWorkers.addEventListener("controllerchange", handleControllerChange);
  try {
    worker.postMessage({ type: "SKIP_WAITING" });
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}

export function isReloadNavigation(
  performanceObject: Performance = window.performance,
): boolean {
  const navigationEntry = performanceObject.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  if (navigationEntry) return navigationEntry.type === "reload";

  return (
    performanceObject as unknown as {
      navigation?: { type: number };
    }
  ).navigation?.type === 1;
}

export function startWebAppUpdateChecks(
  registration: UpdateRegistration,
  onWaiting: () => void,
  environment: UpdateCheckEnvironment = {
    document,
    navigator,
    window,
  },
): () => void {
  let disposed = false;
  let updatePromise: Promise<void> | null = null;
  let reportedWaitingWorker: ServiceWorker | null = null;
  const observedWorkers = new Map<ServiceWorker, EventListener>();

  const reportWaitingWorker = () => {
    const waitingWorker = registration.waiting;
    if (!waitingWorker) {
      reportedWaitingWorker = null;
      return;
    }
    if (!disposed && waitingWorker !== reportedWaitingWorker) {
      reportedWaitingWorker = waitingWorker;
      onWaiting();
    }
  };

  const observeWorker = (worker: ServiceWorker | null) => {
    if (!worker || observedWorkers.has(worker)) return;

    const handleStateChange = () => {
      if (worker.state === "installed") reportWaitingWorker();
    };
    worker.addEventListener("statechange", handleStateChange);
    observedWorkers.set(worker, handleStateChange);

    if (worker.state === "installed") reportWaitingWorker();
  };

  const handleUpdateFound = () => observeWorker(registration.installing);
  registration.addEventListener("updatefound", handleUpdateFound);
  observeWorker(registration.installing);
  reportWaitingWorker();

  const checkForUpdate = (): Promise<void> => {
    reportWaitingWorker();
    if (
      disposed ||
      !environment.navigator.onLine ||
      environment.document.visibilityState !== "visible" ||
      registration.waiting
    ) {
      return Promise.resolve();
    }
    if (updatePromise) return updatePromise;

    updatePromise = registration
      .update()
      .then(() => {
        observeWorker(registration.installing);
        reportWaitingWorker();
      })
      .catch((error: unknown) => {
        log.warn({
          action: "web.service_worker.check",
          error: serializeErrorForLog(error),
          outcome: "failure",
          update: {
            online: environment.navigator.onLine,
            workerState: registration.installing?.state ?? "missing",
          },
        });
      })
      .finally(() => {
        updatePromise = null;
      });
    return updatePromise;
  };

  const requestUpdateCheck = () => {
    void checkForUpdate();
  };
  const handleVisibilityChange = () => {
    if (environment.document.visibilityState === "visible") {
      requestUpdateCheck();
    }
  };

  requestUpdateCheck();
  const intervalId = environment.window.setInterval(
    requestUpdateCheck,
    UPDATE_CHECK_INTERVAL_MS,
  );
  environment.document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );
  environment.window.addEventListener("online", requestUpdateCheck);
  environment.window.addEventListener("pageshow", requestUpdateCheck);

  return () => {
    disposed = true;
    environment.window.clearInterval(intervalId);
    environment.document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
    environment.window.removeEventListener("online", requestUpdateCheck);
    environment.window.removeEventListener("pageshow", requestUpdateCheck);
    registration.removeEventListener("updatefound", handleUpdateFound);
    for (const [worker, listener] of observedWorkers) {
      worker.removeEventListener("statechange", listener);
    }
    observedWorkers.clear();
  };
}

export function createWebAppUpdateState(
  needRefresh: boolean,
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>,
): AppUpdateState {
  return {
    needRefresh,
    update: () => updateServiceWorker(true),
  };
}

export function useWebAppUpdate({ immediate = false } = {}): AppUpdateState {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [reloadPageOnce] = useState(() =>
    createRunOnce(() => window.location.reload()),
  );
  const reloadedByUser = useRef(isReloadNavigation());
  const automaticUpdateAttempted = useRef(false);
  const controllerChangeCleanup = useRef<(() => void) | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate,
    onNeedReload: reloadPageOnce,
    onRegisterError: (error) => {
      log.warn({
        action: "web.service_worker.register",
        error: serializeErrorForLog(error),
        outcome: "failure",
        update: { online: navigator.onLine },
      });
    },
    onRegisteredSW: (_serviceWorkerUrl, nextRegistration) => {
      if (nextRegistration) setRegistration(nextRegistration);
    },
  });

  const markUpdateAvailable = useCallback(() => {
    setNeedRefresh(true);
  }, [setNeedRefresh]);

  useEffect(() => {
    if (!registration) return;
    return startWebAppUpdateChecks(registration, markUpdateAvailable);
  }, [markUpdateAvailable, registration]);

  const applyUpdate = useCallback(
    async (trigger: "automatic" | "manual") => {
      const waitingWorker = registration?.waiting;
      if (!waitingWorker) {
        await updateServiceWorker(true);
        if (trigger === "manual") reloadPageOnce();
        return;
      }

      controllerChangeCleanup.current?.();
      controllerChangeCleanup.current = null;
      try {
        controllerChangeCleanup.current = activateWaitingServiceWorker(
          waitingWorker,
          navigator.serviceWorker,
          () => {
            controllerChangeCleanup.current = null;
            reloadPageOnce();
          },
        );
      } catch (error) {
        log.warn({
          action: "web.service_worker.activate",
          error: serializeErrorForLog(error),
          outcome: "failure",
          update: {
            online: navigator.onLine,
            trigger,
            workerState: waitingWorker.state,
          },
        });
        // Keep the visible update action available for another attempt.
      }
    },
    [registration, reloadPageOnce, updateServiceWorker],
  );

  useEffect(
    () => () => {
      controllerChangeCleanup.current?.();
      controllerChangeCleanup.current = null;
    },
    [],
  );

  useEffect(() => {
    if (
      !needRefresh ||
      !reloadedByUser.current ||
      automaticUpdateAttempted.current
    ) {
      return;
    }

    automaticUpdateAttempted.current = true;
    void applyUpdate("automatic").catch((error: unknown) => {
      log.warn({
        action: "web.service_worker.activate",
        error: serializeErrorForLog(error),
        outcome: "failure",
        update: {
          online: navigator.onLine,
          trigger: "automatic",
          workerState: registration?.waiting?.state ?? "missing",
        },
      });
      // Keep the visible update action available when activation fails.
    });
  }, [applyUpdate, needRefresh, registration]);

  return useMemo(
    () =>
      createWebAppUpdateState(needRefresh, () =>
        applyUpdate("manual").catch((error: unknown) => {
          log.warn({
            action: "web.service_worker.activate",
            error: serializeErrorForLog(error),
            outcome: "failure",
            update: {
              online: navigator.onLine,
              trigger: "manual",
              workerState: registration?.waiting?.state ?? "missing",
            },
          });
          throw error;
        }),
      ),
    [applyUpdate, needRefresh, registration?.waiting?.state],
  );
}
