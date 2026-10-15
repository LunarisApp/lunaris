import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { log } from "evlog";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useRegisterSWMock } = vi.hoisted(() => ({
  useRegisterSWMock: vi.fn(),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: useRegisterSWMock,
}));

import {
  activateWaitingServiceWorker,
  createRunOnce,
  createWebAppUpdateState,
  isReloadNavigation,
  startWebAppUpdateChecks,
  useWebAppUpdate,
} from "./app-update";
import { scheduleServiceWorkerRegistration } from "./service-worker-registration";

type WorkerState = ServiceWorkerState;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function createWorker(initialState: WorkerState = "installing") {
  const events = new EventTarget();
  let state = initialState;
  const postMessage = vi.fn();
  const worker = {
    addEventListener: events.addEventListener.bind(events),
    postMessage,
    get state() {
      return state;
    },
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as ServiceWorker;

  return {
    postMessage,
    setState(nextState: WorkerState) {
      state = nextState;
      events.dispatchEvent(new Event("statechange"));
    },
    worker,
  };
}

function createControllerChangeTarget() {
  const events = new EventTarget();
  const addEventListener = vi.fn(events.addEventListener.bind(events));
  const removeEventListener = vi.fn(events.removeEventListener.bind(events));
  return {
    addEventListener,
    dispatch() {
      events.dispatchEvent(new Event("controllerchange"));
    },
    removeEventListener,
    target: {
      addEventListener,
      removeEventListener,
    },
  };
}

function mockServiceWorkerContainer(
  serviceWorkers: ReturnType<typeof createControllerChangeTarget>["target"],
) {
  const descriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "serviceWorker",
  );
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorkers,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(navigator, "serviceWorker", descriptor);
    } else {
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  };
}

function createRegistration({
  installing = null,
  update,
  waiting = null,
}: {
  installing?: ServiceWorker | null;
  update?: () => Promise<ServiceWorkerRegistration>;
  waiting?: ServiceWorker | null;
} = {}) {
  const events = new EventTarget();
  let installingWorker = installing;
  let waitingWorker = waiting;
  const updateMock = vi.fn<() => Promise<ServiceWorkerRegistration>>();
  const registration = {
    addEventListener: events.addEventListener.bind(events),
    get installing() {
      return installingWorker;
    },
    removeEventListener: events.removeEventListener.bind(events),
    update: updateMock,
    get waiting() {
      return waitingWorker;
    },
  };
  updateMock.mockImplementation(
    update ??
      (async () => registration as unknown as ServiceWorkerRegistration),
  );

  return {
    dispatchUpdateFound() {
      events.dispatchEvent(new Event("updatefound"));
    },
    registration,
    setInstalling(worker: ServiceWorker | null) {
      installingWorker = worker;
    },
    setWaiting(worker: ServiceWorker | null) {
      waitingWorker = worker;
    },
  };
}

function createEnvironment({
  online = true,
  visibilityState = "visible" as DocumentVisibilityState,
} = {}) {
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  let currentVisibilityState = visibilityState;
  let intervalHandler: (() => void) | null = null;
  const clearInterval = vi.fn();
  const setInterval = vi.fn((handler: () => void) => {
    intervalHandler = handler;
    return 42;
  });
  const environment = {
    document: {
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener:
        documentEvents.removeEventListener.bind(documentEvents),
      get visibilityState() {
        return currentVisibilityState;
      },
    },
    navigator: { onLine: online },
    window: {
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      clearInterval,
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
      setInterval,
    },
  };

  return {
    clearInterval,
    dispatchDocument(type: string) {
      documentEvents.dispatchEvent(new Event(type));
    },
    dispatchWindow(type: string) {
      windowEvents.dispatchEvent(new Event(type));
    },
    environment,
    runInterval() {
      intervalHandler?.();
    },
    setOnline(onlineState: boolean) {
      environment.navigator.onLine = onlineState;
    },
    setVisibility(nextState: DocumentVisibilityState) {
      currentVisibilityState = nextState;
    },
  };
}

function mockPwaRegister({
  needRefresh = false,
  updateServiceWorker = vi.fn(async () => {}),
}: {
  needRefresh?: boolean;
  updateServiceWorker?: ReturnType<typeof vi.fn>;
} = {}) {
  const setNeedRefresh = vi.fn();
  let registeredCallback:
    | ((url: string, registration?: ServiceWorkerRegistration) => void)
    | undefined;
  let registerErrorCallback: ((error: unknown) => void) | undefined;
  useRegisterSWMock.mockImplementation(
    (options: {
      onRegisterError?: (error: unknown) => void;
      onRegisteredSW?: (
        url: string,
        registration?: ServiceWorkerRegistration,
      ) => void;
    }) => {
      registerErrorCallback = options.onRegisterError;
      registeredCallback = options.onRegisteredSW;
      return {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [false, vi.fn()],
        updateServiceWorker,
      };
    },
  );
  return {
    getRegisterErrorCallback: () => registerErrorCallback,
    getRegisteredCallback: () => registeredCallback,
    setNeedRefresh,
    updateServiceWorker,
  };
}

function renderWebAppUpdateHook() {
  const container = document.createElement("div");
  const result: { current: ReturnType<typeof useWebAppUpdate> | null } = {
    current: null,
  };
  const root = createRoot(container);

  function HookProbe() {
    result.current = useWebAppUpdate();
    return null;
  }

  act(() => root.render(createElement(HookProbe)));
  return {
    result,
    unmount() {
      act(() => root.unmount());
    },
  };
}

async function settleUpdateCheck() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  useRegisterSWMock.mockReset();
  vi.restoreAllMocks();
});

describe("web app update adapter", () => {
  it("reloads after accepting a service-worker update", async () => {
    const updateServiceWorker = vi.fn(async () => {});
    const state = createWebAppUpdateState(true, updateServiceWorker);

    expect(state.needRefresh).toBe(true);
    await state.update();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("recognizes modern and legacy reload navigations", () => {
    const modernPerformance = {
      getEntriesByType: () => [{ type: "reload" }],
    } as unknown as Performance;
    const legacyPerformance = {
      getEntriesByType: () => [],
      navigation: { type: 1 },
    } as unknown as Performance;

    expect(isReloadNavigation(modernPerformance)).toBe(true);
    expect(isReloadNavigation(legacyPerformance)).toBe(true);
  });

  it("does not treat normal navigation as reload", () => {
    const performanceObject = {
      getEntriesByType: () => [{ type: "navigate" }],
    } as unknown as Performance;

    expect(isReloadNavigation(performanceObject)).toBe(false);
  });
});

describe("service-worker registration scheduling", () => {
  it("waits for load and idle before registering", () => {
    const events = new EventTarget();
    let idleCallback: IdleRequestCallback | undefined;
    const callback = vi.fn();
    const requestIdleCallback = vi.fn((next: IdleRequestCallback) => {
      idleCallback = next;
      return 7;
    });
    const cleanup = scheduleServiceWorkerRegistration(callback, {
      document: { readyState: "loading" },
      window: {
        addEventListener: events.addEventListener.bind(events),
        cancelIdleCallback: vi.fn(),
        clearTimeout: vi.fn(),
        removeEventListener: events.removeEventListener.bind(events),
        requestIdleCallback,
        setTimeout: vi.fn(() => 8),
      },
    });

    expect(requestIdleCallback).not.toHaveBeenCalled();
    events.dispatchEvent(new Event("load"));
    expect(requestIdleCallback).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();

    idleCallback?.({ didTimeout: false, timeRemaining: () => 10 });
    expect(callback).toHaveBeenCalledOnce();
    cleanup();
  });

  it("uses a timer fallback when idle callbacks are unavailable", () => {
    let timeoutCallback: (() => void) | undefined;
    const callback = vi.fn();
    scheduleServiceWorkerRegistration(callback, {
      document: { readyState: "complete" },
      window: {
        addEventListener: vi.fn(),
        clearTimeout: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout: vi.fn((next: () => void) => {
          timeoutCallback = next;
          return 9;
        }),
      },
    });

    expect(callback).not.toHaveBeenCalled();
    timeoutCallback?.();
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe("service-worker activation", () => {
  it("activates the exact waiting worker and reloads after control changes", () => {
    const waitingWorker = createWorker("installed");
    const serviceWorkers = createControllerChangeTarget();
    const onControllerChange = vi.fn();

    activateWaitingServiceWorker(
      waitingWorker.worker,
      serviceWorkers.target,
      onControllerChange,
    );

    expect(waitingWorker.postMessage).toHaveBeenCalledOnce();
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });
    expect(onControllerChange).not.toHaveBeenCalled();

    serviceWorkers.dispatch();
    serviceWorkers.dispatch();
    expect(onControllerChange).toHaveBeenCalledOnce();
  });

  it("reloads once when native and Workbox callbacks both fire", () => {
    const waitingWorker = createWorker("installed");
    const serviceWorkers = createControllerChangeTarget();
    const reload = vi.fn();
    const reloadOnce = createRunOnce(reload);

    activateWaitingServiceWorker(
      waitingWorker.worker,
      serviceWorkers.target,
      reloadOnce,
    );
    reloadOnce();
    serviceWorkers.dispatch();

    expect(reload).toHaveBeenCalledOnce();
  });

  it("removes the controller listener when worker messaging fails", () => {
    const waitingWorker = createWorker("installed");
    const serviceWorkers = createControllerChangeTarget();
    const onControllerChange = vi.fn();
    waitingWorker.postMessage.mockImplementation(() => {
      throw new Error("worker stopped");
    });

    expect(() =>
      activateWaitingServiceWorker(
        waitingWorker.worker,
        serviceWorkers.target,
        onControllerChange,
      ),
    ).toThrow("worker stopped");

    serviceWorkers.dispatch();
    expect(onControllerChange).not.toHaveBeenCalled();
  });

  it("supports cleanup before the controller changes", () => {
    const waitingWorker = createWorker("installed");
    const serviceWorkers = createControllerChangeTarget();
    const onControllerChange = vi.fn();
    const cleanup = activateWaitingServiceWorker(
      waitingWorker.worker,
      serviceWorkers.target,
      onControllerChange,
    );

    cleanup();
    serviceWorkers.dispatch();

    expect(onControllerChange).not.toHaveBeenCalled();
  });
});

describe("service-worker update checks", () => {
  it("reports an already-waiting worker without another network check", () => {
    const { worker } = createWorker("installed");
    const { registration } = createRegistration({ waiting: worker });
    const { environment } = createEnvironment();
    const onWaiting = vi.fn();

    const stop = startWebAppUpdateChecks(
      registration,
      onWaiting,
      environment,
    );

    expect(onWaiting).toHaveBeenCalledOnce();
    expect(registration.update).not.toHaveBeenCalled();
    stop();
  });

  it("reports an update only after its worker finishes installing", async () => {
    const installing = createWorker();
    const registrationState = createRegistration();
    const { environment } = createEnvironment();
    const onWaiting = vi.fn();
    const stop = startWebAppUpdateChecks(
      registrationState.registration,
      onWaiting,
      environment,
    );
    await vi.waitFor(() =>
      expect(registrationState.registration.update).toHaveBeenCalledOnce(),
    );

    registrationState.setInstalling(installing.worker);
    registrationState.dispatchUpdateFound();

    expect(onWaiting).not.toHaveBeenCalled();

    registrationState.setWaiting(installing.worker);
    installing.setState("installed");

    expect(onWaiting).toHaveBeenCalledOnce();
    stop();
  });

  it("checks immediately, periodically, on resume, and on reconnect", async () => {
    const { registration } = createRegistration();
    const environmentState = createEnvironment();
    const stop = startWebAppUpdateChecks(
      registration,
      vi.fn(),
      environmentState.environment,
    );
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(1));
    await settleUpdateCheck();

    environmentState.runInterval();
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2));
    await settleUpdateCheck();

    environmentState.dispatchWindow("pageshow");
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(3));
    await settleUpdateCheck();

    environmentState.setVisibility("hidden");
    environmentState.dispatchDocument("visibilitychange");
    expect(registration.update).toHaveBeenCalledTimes(3);

    environmentState.setVisibility("visible");
    environmentState.dispatchDocument("visibilitychange");
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(4));
    await settleUpdateCheck();

    environmentState.dispatchWindow("online");
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(5));
    stop();
  });

  it("waits for connectivity and serializes concurrent checks", async () => {
    let resolveUpdate!: (registration: ServiceWorkerRegistration) => void;
    const update = () =>
      new Promise<ServiceWorkerRegistration>((resolve) => {
        resolveUpdate = resolve;
      });
    const { registration } = createRegistration({ update });
    const environmentState = createEnvironment({ online: false });
    const stop = startWebAppUpdateChecks(
      registration,
      vi.fn(),
      environmentState.environment,
    );

    expect(registration.update).not.toHaveBeenCalled();
    environmentState.setOnline(true);
    environmentState.dispatchWindow("online");
    environmentState.dispatchWindow("pageshow");
    environmentState.runInterval();
    expect(registration.update).toHaveBeenCalledOnce();

    resolveUpdate?.(registration as unknown as ServiceWorkerRegistration);
    await settleUpdateCheck();
    environmentState.dispatchWindow("pageshow");
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2));
    stop();
  });

  it("recovers from failed checks and removes listeners", async () => {
    const warn = vi.spyOn(log, "warn");
    const { registration } = createRegistration({
      update: vi
        .fn<() => Promise<ServiceWorkerRegistration>>()
        .mockRejectedValueOnce(new Error("suspended"))
        .mockResolvedValue({} as ServiceWorkerRegistration),
    });
    const environmentState = createEnvironment();
    const stop = startWebAppUpdateChecks(
      registration,
      vi.fn(),
      environmentState.environment,
    );
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    await settleUpdateCheck();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "web.service_worker.check",
        outcome: "failure",
      }),
    );

    environmentState.dispatchWindow("pageshow");
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2));
    stop();
    environmentState.dispatchWindow("pageshow");
    environmentState.runInterval();

    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(environmentState.clearInterval).toHaveBeenCalledWith(42);
  });
});

describe("useWebAppUpdate", () => {
  it("reloads after a manual update when no waiting worker remains", async () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "navigate" } as PerformanceNavigationTiming,
    ]);
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => undefined);
    const pwa = mockPwaRegister({ needRefresh: true });
    const { registration } = createRegistration();
    const hook = renderWebAppUpdateHook();

    act(() => {
      pwa.getRegisteredCallback()?.(
        "/sw.js",
        registration as unknown as ServiceWorkerRegistration,
      );
    });
    await act(async () => {
      await hook.result.current?.update();
    });

    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(reload).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it("reports registration failures", () => {
    const warn = vi.spyOn(log, "warn");
    const pwa = mockPwaRegister();
    const hook = renderWebAppUpdateHook();
    const error = new Error("registration blocked");

    act(() => pwa.getRegisterErrorCallback()?.(error));

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "web.service_worker.register",
        outcome: "failure",
      }),
    );
    hook.unmount();
  });

  it("uses direct activation for a registered waiting worker", async () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "navigate" } as PerformanceNavigationTiming,
    ]);
    const serviceWorkers = createControllerChangeTarget();
    const restoreServiceWorkers = mockServiceWorkerContainer(
      serviceWorkers.target,
    );
    const waitingWorker = createWorker("installed");
    const { registration } = createRegistration({
      waiting: waitingWorker.worker,
    });
    const pwa = mockPwaRegister({ needRefresh: true });
    const hook = renderWebAppUpdateHook();

    act(() => {
      pwa.getRegisteredCallback()?.(
        "/sw.js",
        registration as unknown as ServiceWorkerRegistration,
      );
    });
    await act(async () => {
      await hook.result.current?.update();
    });

    expect(waitingWorker.postMessage).toHaveBeenCalledOnce();
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();

    hook.unmount();
    expect(serviceWorkers.removeEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
    );
    restoreServiceWorkers();
  });

  it("keeps direct activation retryable after worker messaging fails", async () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "navigate" } as PerformanceNavigationTiming,
    ]);
    const serviceWorkers = createControllerChangeTarget();
    const restoreServiceWorkers = mockServiceWorkerContainer(
      serviceWorkers.target,
    );
    const waitingWorker = createWorker("installed");
    waitingWorker.postMessage.mockImplementationOnce(() => {
      throw new Error("worker stopped");
    });
    const { registration } = createRegistration({
      waiting: waitingWorker.worker,
    });
    const pwa = mockPwaRegister({ needRefresh: true });
    const hook = renderWebAppUpdateHook();

    act(() => {
      pwa.getRegisteredCallback()?.(
        "/sw.js",
        registration as unknown as ServiceWorkerRegistration,
      );
    });
    await act(async () => {
      await hook.result.current?.update();
      await hook.result.current?.update();
    });

    expect(hook.result.current?.needRefresh).toBe(true);
    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(2);
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();

    hook.unmount();
    restoreServiceWorkers();
  });

  it("auto-applies a waiting update after intentional reload", async () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);
    const { updateServiceWorker } = mockPwaRegister({ needRefresh: true });

    const hook = renderWebAppUpdateHook();

    await vi.waitFor(() => {
      expect(updateServiceWorker).toHaveBeenCalledOnce();
      expect(updateServiceWorker).toHaveBeenCalledWith(true);
    });
    hook.unmount();
  });

  it("keeps ordinary active-session updates user-controlled", () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "navigate" } as PerformanceNavigationTiming,
    ]);
    const { updateServiceWorker } = mockPwaRegister({ needRefresh: true });

    const { result, unmount } = renderWebAppUpdateHook();

    expect(result.current?.needRefresh).toBe(true);
    expect(updateServiceWorker).not.toHaveBeenCalled();
    unmount();
  });

  it("does not reload again when a manual reload finds no update", () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);
    const { updateServiceWorker } = mockPwaRegister();

    const { result, unmount } = renderWebAppUpdateHook();

    expect(result.current?.needRefresh).toBe(false);
    expect(updateServiceWorker).not.toHaveBeenCalled();
    unmount();
  });

  it("checks as soon as service-worker registration completes", async () => {
    vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([]);
    const pwa = mockPwaRegister();
    const { registration } = createRegistration();
    const { unmount } = renderWebAppUpdateHook();

    act(() => {
      pwa.getRegisteredCallback()?.(
        "/sw.js",
        registration as unknown as ServiceWorkerRegistration,
      );
    });

    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());
    unmount();
  });
});
