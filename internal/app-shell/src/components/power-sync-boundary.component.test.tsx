import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PowerSyncBoundary } from "./power-sync-boundary";

const { activate, createPowerSyncSession, release, testState } = vi.hoisted(
  () => ({
    activate: vi.fn(),
    createPowerSyncSession: vi.fn(),
    release: vi.fn(),
    testState: { organizationId: "organization-1", sessionId: "session-1" },
  })
);

vi.mock("../runtime", () => ({
  useAppRuntime: () => ({ createPowerSyncSession }),
}));

vi.mock("./power-sync-session-coordinator", () => ({
  powerSyncSessionCoordinator: {
    activate,
    create: (factory: () => Promise<unknown>) => factory(),
    release,
  },
}));

vi.mock("@repo/data/core", () => ({
  createSyncBlocker: () => ({ id: "blocker" }),
  isOfflineEncryptionKeyError: (error: unknown) =>
    error instanceof Error && error.name === "OfflineEncryptionKeyError",
  PowerSyncProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@repo/features/api", () => ({
  ApiProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@repo/features/debug-logging", () => ({
  DebugLoggingSync: () => null,
}));
vi.mock("@repo/features/entitlements", () => ({
  EntitlementsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@repo/features/region", () => ({
  useRegionClients: () => ({
    apiClient: {},
    authClient: {
      useActiveOrganization: () => ({
        data: { id: testState.organizationId },
      }),
      useSession: () => ({
        data: {
          session: { id: testState.sessionId },
          user: { id: "user-1", isAnonymous: false },
        },
      }),
    },
    manifest: {
      apiUrl: "https://api.example.com",
      regionId: "eu",
    },
  }),
}));
vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <span>loading</span>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@repo/auth/sync-access", () => ({
  resolveSyncAccess: () => "cloud",
}));
vi.mock("evlog", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
  parseError: (error: unknown) => error,
}));

function createSession() {
  return {
    close: vi.fn(),
    connect: vi.fn(),
    database: {},
    disconnect: vi.fn(),
    estimateStorage: vi.fn(),
    purge: vi.fn(),
    storageName: "lunaris.v2.test.db",
  };
}

describe("PowerSyncBoundary offline boot", () => {
  afterEach(() => {
    testState.sessionId = "session-1";
    testState.organizationId = "organization-1";
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("passes cached auth session id into PowerSync boot", async () => {
    createPowerSyncSession.mockResolvedValue(createSession());

    render(
      <PowerSyncBoundary>
        <span>editor</span>
      </PowerSyncBoundary>
    );

    expect(await screen.findByText("editor")).toBeTruthy();
    expect(createPowerSyncSession).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: "https://api.example.com",
        regionId: "eu",
        sessionId: "session-1",
        userId: "user-1",
      })
    );
  });

  it("opens one database worker under StrictMode", async () => {
    createPowerSyncSession.mockResolvedValue(createSession());

    render(
      <StrictMode>
        <PowerSyncBoundary>
          <span>editor</span>
        </PowerSyncBoundary>
      </StrictMode>
    );

    expect(await screen.findByText("editor")).toBeTruthy();
    expect(createPowerSyncSession).toHaveBeenCalledTimes(1);
  });

  it("stops rendering the old database session during account changes", async () => {
    let resolveNextSession:
      | ((session: ReturnType<typeof createSession>) => void)
      | undefined;
    createPowerSyncSession
      .mockResolvedValueOnce(createSession())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNextSession = resolve;
          })
      );

    const view = render(
      <PowerSyncBoundary>
        <span>editor</span>
      </PowerSyncBoundary>
    );
    expect(await screen.findByText("editor")).toBeTruthy();

    testState.sessionId = "session-2";
    view.rerender(
      <PowerSyncBoundary>
        <span>editor</span>
      </PowerSyncBoundary>
    );

    expect(screen.queryByText("editor")).toBeNull();
    expect(screen.getByText("loading")).toBeTruthy();

    await waitFor(() =>
      expect(createPowerSyncSession).toHaveBeenCalledTimes(2)
    );
    resolveNextSession?.(createSession());
    expect(await screen.findByText("editor")).toBeTruthy();
  });

  it("restarts the database session during organization changes", async () => {
    createPowerSyncSession.mockResolvedValue(createSession());
    const view = render(
      <PowerSyncBoundary>
        <span>editor</span>
      </PowerSyncBoundary>
    );
    expect(await screen.findByText("editor")).toBeTruthy();

    testState.organizationId = "organization-2";
    view.rerender(
      <PowerSyncBoundary>
        <span>editor</span>
      </PowerSyncBoundary>
    );

    expect(screen.queryByText("editor")).toBeNull();
    expect(screen.getByText("loading")).toBeTruthy();
    await waitFor(() =>
      expect(createPowerSyncSession).toHaveBeenCalledTimes(2)
    );
    expect(await screen.findByText("editor")).toBeTruthy();
  });

  it("shows recoverable offline unlock state and retries manually", async () => {
    const offlineError = new Error("offline");
    offlineError.name = "OfflineEncryptionKeyError";
    createPowerSyncSession
      .mockRejectedValueOnce(offlineError)
      .mockResolvedValueOnce(createSession());

    render(
      <PowerSyncBoundary>
        <span>editor</span>
      </PowerSyncBoundary>
    );

    expect(await screen.findByText("errors.offlineUnlock.title")).toBeTruthy();
    fireEvent.click(screen.getByText("common.retry"));

    expect(await screen.findByText("editor")).toBeTruthy();
    expect(createPowerSyncSession).toHaveBeenCalledTimes(2);
  });

  it("retries automatically when connectivity returns", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const offlineError = new Error("offline");
    offlineError.name = "OfflineEncryptionKeyError";
    createPowerSyncSession
      .mockRejectedValueOnce(offlineError)
      .mockResolvedValueOnce(createSession());

    render(
      <PowerSyncBoundary>
        <span>editor</span>
      </PowerSyncBoundary>
    );
    await screen.findByText("errors.offlineUnlock.title");
    await waitFor(() =>
      expect(addEventListener).toHaveBeenCalledWith(
        "online",
        expect.any(Function)
      )
    );

    fireEvent(window, new Event("online"));

    await waitFor(() =>
      expect(createPowerSyncSession).toHaveBeenCalledTimes(2)
    );
    expect(await screen.findByText("editor")).toBeTruthy();
  });
});
