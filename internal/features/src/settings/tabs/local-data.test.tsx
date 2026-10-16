/** @vitest-environment happy-dom */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDataContent } from "./local-data";

const mockClearUploadQueue = vi.fn();
const mockUsePowerSync = vi.fn();
const mockEstimateStorage = vi.fn();
const mockPurgePowerSync = vi.fn();
const mockUseSyncAccess = vi.fn();
const mockUseSyncBlocker = vi.fn();
const mockUseSyncBlockerState = vi.fn();
const mockUseStatus = vi.fn();
const mockNavigate = vi.fn();
const mockUseActiveOrganization = vi.fn();
const mockGetFileStorageWorkspaceIds = vi.fn();
const mockDeleteFileStorageDatabases = vi.fn();
const mockPowerSyncSession = {
  estimateStorage: mockEstimateStorage,
  purge: mockPurgePowerSync,
};

const TRANSLATIONS: Record<string, string> = {
  "settings.local-data.title": "Local Data",
  "settings.local-data.description": "Manage your local data and cached files.",
  "settings.local-data.failedToLoad": "Failed to load local data",
  "settings.local-data.lastSyncedNever": "Never synced",
  "settings.local-data.syncHealthDownloadProgressLabel": "Download progress",
  "settings.local-data.tryAgain": "Retry Sync",
  "settings.local-data.clearQueue": "Discard Pending Uploads",
  "settings.local-data.clearingQueue": "Discarding...",
  "settings.local-data.clearQueueDescription":
    "Permanently discards pending uploads and unsynced changes.",
  "settings.local-data.clearQueueConfirmTitle": "Discard pending uploads?",
  "settings.local-data.clearQueueConfirmDescription":
    "This permanently discards every pending upload and its unsynced changes. This cannot be undone.",
  "settings.local-data.storageUsed": "Data Used",
  "settings.local-data.uploadQueue": "Upload Queue",
  "settings.local-data.noPendingUploads": "No pending uploads",
  "settings.local-data.dangerZone": "Danger Zone",
  "settings.local-data.dangerZoneDescription":
    "These actions are irreversible and only affect local data on this device.",
  "settings.local-data.purgeStorage": "Purge All Local Data",
  "settings.local-data.purgingStorage": "Purging...",
  "settings.local-data.purgeConfirmTitle": "Purge all local data?",
  "settings.local-data.purgeStorageDescription": "Wipes local data.",
  "settings.local-data.purgeConfirmDescription":
    "This will delete all local databases and files. The app will reload.",
  "syncStatus.onlineStatus": "Cloud sync connected",
  "syncStatus.connectingStatus": "Connecting to cloud sync",
  "syncStatus.localOnlyAnonymousMode": "Cloud Sync Is Off",
  "syncStatus.localOnlyAnonymousMessage":
    "Your work stays on this device. Create an account to sync it across devices.",
  "syncStatus.localOnlyAnonymousAction": "Create Account",
  "syncStatus.blockedMode": "Sync Paused",
  "syncStatus.blockedMessage":
    "Several uploads failed, so sync paused for this session. Retry sync, or discard pending uploads if the problem continues.",
  "syncStatus.blockedAuthMode": "Sign In to Resume Sync",
  "syncStatus.blockedAuthMessage":
    "Your session expired. Sign in again, then retry sync.",
  "syncStatus.blockedAuthAction": "Sign In",
  "syncStatus.blockedPermissionMode": "Sync Needs Access",
  "syncStatus.blockedPermissionMessage":
    "Your plan or permissions do not allow sync. Review billing or ask an organization admin, then retry sync.",
  "syncStatus.blockedPermissionAction": "Review Billing",
  "syncStatus.transientErrorMode": "Sync Interrupted",
  "syncStatus.transientErrorMessage":
    "Lunaris cannot reach the sync service. It will keep retrying.",
  "syncStatus.offlineMode": "You Are Offline",
  "syncStatus.offlineMessage":
    "Keep working. Your changes will sync when you are back online.",
  "syncStatus.uploading": "Uploading",
  "syncStatus.downloading": "Downloading",
  "common.cancel": "Cancel",
};

type TVars = {
  count?: number;
  date?: string;
  downloaded?: number;
  message?: string;
  reason?: string;
  size?: string;
  status?: number;
  total?: number;
  used?: string;
  quota?: string;
};

const t = (key: string, vars?: TVars): string => {
  if (key === "syncStatus.lastSynced") {
    return `Last synced: ${vars?.date ?? "-"}`;
  }
  if (key === "syncStatus.transientErrorReason") {
    return `Details: ${vars?.reason ?? ""}`;
  }
  if (key === "syncStatus.consecutiveClientErrors") {
    const count = vars?.count ?? 0;
    return count === 1
      ? `${count} consecutive upload rejection`
      : `${count} consecutive upload rejections`;
  }
  if (key === "syncStatus.lastRejectedStatus") {
    return `Last upload rejected: HTTP ${vars?.status ?? ""}`;
  }
  if (key === "settings.local-data.usageOfQuota") {
    return `${vars?.used ?? ""} of ${vars?.quota ?? ""}`;
  }
  if (key === "settings.local-data.syncHealthDownloadProgressValue") {
    return `${vars?.downloaded ?? 0} / ${vars?.total ?? 0} changes`;
  }
  if (key === "settings.local-data.pendingUploads") {
    const count = vars?.count ?? 0;
    return count === 1 ? `${count} pending upload` : `${count} pending uploads`;
  }
  return TRANSLATIONS[key] ?? key;
};

vi.mock("@repo/data/core", () => ({
  clearUploadQueue: (...args: unknown[]) => mockClearUploadQueue(...args),
  usePowerSync: () => mockUsePowerSync(),
  usePowerSyncSession: () => mockPowerSyncSession,
  useSyncAccess: () => mockUseSyncAccess(),
  useSyncBlocker: () => mockUseSyncBlocker(),
  useSyncBlockerState: () => mockUseSyncBlockerState(),
}));

vi.mock("@repo/data/features/sync-status", () => ({
  useStatus: () => mockUseStatus(),
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({ useActiveOrganization: mockUseActiveOrganization }),
}));

vi.mock("@repo/data/features/attachments", () => ({
  deleteFileStorageDatabases: (...args: unknown[]) =>
    mockDeleteFileStorageDatabases(...args),
  getFileStorageWorkspaceIds: (...args: unknown[]) =>
    mockGetFileStorageWorkspaceIds(...args),
}));

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t,
  }),
}));

vi.mock("@lunarisapp/ui/components/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTrigger: ({
    children,
    render,
  }: {
    children: ReactNode;
    render: ReactNode;
  }) => (
    <div>
      {render}
      {children}
    </div>
  ),
}));

vi.mock("@lunarisapp/ui/blocks/confirmation-dialog", () => ({
  ConfirmationDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    title?: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <div>{title}</div>
        <div>{description}</div>
        <button onClick={() => onOpenChange(false)}>
          {cancelLabel ?? "Cancel"}
        </button>
        <button onClick={onConfirm}>{confirmLabel ?? "Continue"}</button>
      </div>
    ) : null,
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@lunarisapp/ui/components/progress", () => ({
  Progress: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ProgressLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ProgressValue: ({ children }: { children: () => string }) => (
    <div>{children()}</div>
  ),
}));

vi.mock("@lunarisapp/ui/components/skeleton", () => ({
  Skeleton: () => <div>loading</div>,
}));

function mockStorageApis() {
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: {
      estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 1000 }),
      getDirectory: vi.fn().mockResolvedValue({
        async *[Symbol.asyncIterator]() {},
      }),
    },
  });
}

function makeDb() {
  return {
    close: vi.fn(),
    disconnectAndClear: vi.fn(),
    getUploadQueueStats: vi.fn().mockResolvedValue({ count: 2, size: 1200 }),
  };
}

function makeStatus(overrides: Record<string, unknown> = {}) {
  return {
    connected: true,
    connecting: false,
    hasSynced: true,
    lastSyncedAt: new Date("2026-04-07T00:00:00Z"),
    downloadProgress: null,
    dataFlowStatus: {
      downloading: false,
      uploading: false,
      downloadError: undefined,
      uploadError: undefined,
    },
    ...overrides,
  };
}

describe("LocalDataContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncAccess.mockReturnValue("cloud");
    mockUseStatus.mockReturnValue(makeStatus());
    mockUseSyncBlockerState.mockReturnValue({
      blocked: false,
      consecutiveClientErrors: 0,
      lastClientErrorStatus: null,
    });
    mockGetFileStorageWorkspaceIds.mockResolvedValue([
      "workspace_1",
      "workspace_2",
    ]);
    mockDeleteFileStorageDatabases.mockResolvedValue(undefined);
    mockEstimateStorage.mockImplementation(async () => {
      const estimate = await navigator.storage.estimate();
      return { quota: estimate.quota ?? null, usage: estimate.usage ?? 0 };
    });
    mockPurgePowerSync.mockImplementation(async () => {
      const db = mockUsePowerSync();
      await db.disconnectAndClear();
      await db.close();
    });
    mockNavigate.mockReset();
    mockUseActiveOrganization.mockReturnValue({
      data: { id: "organization-1", slug: "northstar" },
    });
  });

  it("renders local-only anonymous card with a Create Account CTA", async () => {
    const user = userEvent.setup();
    const db = makeDb();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });
    mockUseSyncAccess.mockReturnValue("local-only");
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: false,
        hasSynced: false,
        lastSyncedAt: undefined,
      })
    );

    render(<LocalDataContent />);

    await screen.findByText("Cloud Sync Is Off");
    expect(
      screen.getByText(
        "Your work stays on this device. Create an account to sync it across devices."
      )
    ).toBeTruthy();
    expect(screen.getByText("Never synced")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth/register");
  });

  it("renders connecting state", async () => {
    const db = makeDb();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: false,
        connecting: true,
        hasSynced: false,
      })
    );

    render(<LocalDataContent />);

    await screen.findByTestId("settings-local-data-sync-health");
    expect(screen.getByText("Connecting to cloud sync")).toBeTruthy();
  });

  it("renders online (up-to-date) state when connected and idle", async () => {
    const db = makeDb();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });

    render(<LocalDataContent />);

    await screen.findByTestId("settings-local-data-sync-health");
    expect(screen.getByText("Cloud sync connected")).toBeTruthy();
    expect(
      screen.getByRole("meter", {
        name: "Data Used",
        value: { max: 1000, min: 0, now: 100, text: "100 B of 1 KB" },
      })
    ).toBeTruthy();
  });

  it("renders transfer hint when connected and uploading + downloading", async () => {
    const db = makeDb();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });
    mockUseStatus.mockReturnValue(
      makeStatus({
        downloadProgress: {
          downloadedFraction: 0.4,
          downloadedOperations: 124,
          totalOperations: 310,
        },
        dataFlowStatus: {
          downloading: true,
          uploading: true,
          downloadError: undefined,
          uploadError: undefined,
        },
      })
    );

    render(<LocalDataContent />);

    await screen.findByTestId("settings-local-data-sync-health");
    expect(screen.getByText("Uploading")).toBeTruthy();
    expect(screen.getByText("Downloading")).toBeTruthy();
    expect(screen.getByText("Download progress")).toBeTruthy();
    expect(screen.getByText("124 / 310 changes")).toBeTruthy();
  });

  it("renders offline card when disconnected without blocker", async () => {
    const db = makeDb();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: false,
      })
    );

    render(<LocalDataContent />);

    await screen.findByText("You Are Offline");
    expect(
      screen.getByText(
        "Keep working. Your changes will sync when you are back online."
      )
    ).toBeTruthy();
  });

  it("renders blocked-auth card with Sign In CTA + retries sync", async () => {
    const user = userEvent.setup();
    const db = makeDb();
    const resume = vi.fn();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume });
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 401,
    });
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: false,
      })
    );

    render(<LocalDataContent />);

    await screen.findByText("Sign In to Resume Sync");
    expect(screen.getByText("3 consecutive upload rejections")).toBeTruthy();
    expect(screen.getByText("Last upload rejected: HTTP 401")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");

    await user.click(screen.getByRole("button", { name: "Retry Sync" }));
    expect(resume).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(db.getUploadQueueStats).toHaveBeenCalledTimes(2);
    });
  });

  it("renders blocked-permission card with Review Billing CTA", async () => {
    const user = userEvent.setup();
    const db = makeDb();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 1,
      lastClientErrorStatus: 403,
    });
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: false,
      })
    );

    render(<LocalDataContent />);

    await screen.findByText("Sync Needs Access");
    await user.click(screen.getByRole("button", { name: "Review Billing" }));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/northstar/settings?tab=billing"
    );
  });

  it("renders generic blocked card with retry and discard actions", async () => {
    const db = makeDb();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 409,
    });
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: false,
      })
    );

    render(<LocalDataContent />);

    await screen.findByText("Sync Paused");
    expect(screen.getByText("Last upload rejected: HTTP 409")).toBeTruthy();
    expect(
      within(screen.getByTestId("settings-local-data-sync-health")).getByRole(
        "button",
        { name: "Retry Sync" }
      )
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("settings-local-data-sync-health")).getByRole(
        "button",
        { name: "Discard Pending Uploads" }
      )
    ).toBeTruthy();
  });

  it("renders transient-error card with details and retry action", async () => {
    const user = userEvent.setup();
    const db = makeDb();
    const resume = vi.fn();
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume });
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: true,
        dataFlowStatus: {
          downloading: false,
          uploading: false,
          downloadError: undefined,
          uploadError: new Error("Gateway timeout"),
        },
      })
    );

    render(<LocalDataContent />);

    await screen.findByText("Sync Interrupted");
    expect(screen.getByText("Details: Gateway timeout")).toBeTruthy();

    await user.click(
      within(screen.getByTestId("settings-local-data-sync-health")).getByRole(
        "button",
        { name: "Retry Sync" }
      )
    );
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("clears the queue from the blocked panel and resumes sync", async () => {
    const user = userEvent.setup();
    const db = makeDb();
    const resume = vi.fn();
    mockStorageApis();
    mockClearUploadQueue.mockResolvedValue(undefined);
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume });
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 409,
    });
    mockUseStatus.mockReturnValue(
      makeStatus({
        connected: false,
      })
    );

    render(<LocalDataContent />);

    await screen.findByText("Sync Paused");

    await user.click(
      within(screen.getByTestId("settings-local-data-sync-health")).getByRole(
        "button",
        { name: "Discard Pending Uploads" }
      )
    );

    expect(screen.getByText("Discard pending uploads?")).toBeTruthy();
    expect(
      screen.getByText(
        "This permanently discards every pending upload and its unsynced changes. This cannot be undone."
      )
    ).toBeTruthy();

    await user.click(
      within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
        name: "Discard Pending Uploads",
      })
    );

    expect(mockClearUploadQueue).toHaveBeenCalledWith(db);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("deletes workspace file stores when purging local data", async () => {
    const user = userEvent.setup();
    const db = makeDb();
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    mockStorageApis();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });

    render(<LocalDataContent />);
    await screen.findByTestId("settings-local-data-sync-health");

    const purgeButtons = screen.getAllByRole("button", {
      name: "Purge All Local Data",
    });
    await user.click(purgeButtons.at(-1)!);

    await waitFor(() => {
      expect(mockGetFileStorageWorkspaceIds).toHaveBeenCalledWith(db);
      expect(db.disconnectAndClear).toHaveBeenCalledTimes(1);
      expect(mockDeleteFileStorageDatabases).toHaveBeenCalledWith([
        "workspace_1",
        "workspace_2",
      ]);
      expect(db.close).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
