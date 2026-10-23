import { afterEach, expect, test, vi } from "vitest";

const startup = vi.hoisted(() => {
  const deferred = () => {
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  return {
    configuration: deferred(),
    application: deferred(),
    applicationRequested: vi.fn(),
    applicationStarted: vi.fn(),
    loadConfiguration: vi.fn(),
  };
});

vi.mock("./runtime-config", () => ({
  loadRuntimeConfig: () => {
    startup.loadConfiguration();
    return startup.configuration.promise;
  },
}));
vi.mock("./main", async () => {
  startup.applicationRequested();
  // Model an app chunk waiting for the entry's shared exports to initialize.
  await startup.application.promise;
  startup.applicationStarted();
  return {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("finishes entry evaluation while loading config before the application", async () => {
  vi.stubGlobal("__RUNTIME_CONFIG__", true);
  let entryEvaluated = false;
  const entry = import("./bootstrap").then(() => {
    entryEvaluated = true;
  });
  try {
    await vi.waitFor(() =>
      expect(startup.loadConfiguration).toHaveBeenCalledOnce()
    );
    expect(startup.applicationRequested).not.toHaveBeenCalled();
    startup.configuration.resolve();
    await vi.waitFor(() =>
      expect(startup.applicationRequested).toHaveBeenCalledOnce()
    );
    await vi.waitFor(() => expect(entryEvaluated).toBe(true));
    expect(startup.applicationStarted).not.toHaveBeenCalled();
    startup.application.resolve();
    await vi.waitFor(() =>
      expect(startup.applicationStarted).toHaveBeenCalledOnce()
    );
  } finally {
    startup.configuration.resolve();
    startup.application.resolve();
    await entry;
  }
});
