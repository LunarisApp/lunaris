const REGISTRATION_IDLE_TIMEOUT_MS = 5000;

interface UpdateEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface ServiceWorkerRegistrationEnvironment {
  document: {
    readyState: DocumentReadyState;
  };
  window: UpdateEventTarget & {
    cancelIdleCallback?(handle: number): void;
    clearTimeout(handle: number): void;
    requestIdleCallback?(
      callback: IdleRequestCallback,
      options?: IdleRequestOptions
    ): number;
    setTimeout(callback: () => void, timeout: number): number;
  };
}

export function scheduleServiceWorkerRegistration(
  callback: () => void,
  environment: ServiceWorkerRegistrationEnvironment = { document, window }
): () => void {
  let idleHandle: number | undefined;
  let timeoutHandle: number | undefined;
  let disposed = false;
  let registered = false;

  const register = () => {
    if (disposed || registered) {
      return;
    }
    registered = true;
    callback();
  };
  const scheduleWhenIdle = () => {
    if (environment.window.requestIdleCallback) {
      idleHandle = environment.window.requestIdleCallback(register, {
        timeout: REGISTRATION_IDLE_TIMEOUT_MS,
      });
      return;
    }
    timeoutHandle = environment.window.setTimeout(register, 0);
  };

  if (environment.document.readyState === "complete") {
    scheduleWhenIdle();
  } else {
    environment.window.addEventListener("load", scheduleWhenIdle);
  }

  return () => {
    disposed = true;
    environment.window.removeEventListener("load", scheduleWhenIdle);
    if (idleHandle !== undefined) {
      environment.window.cancelIdleCallback?.(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      environment.window.clearTimeout(timeoutHandle);
    }
  };
}
