/** @vitest-environment happy-dom */

import type { IconSvgObject } from "@lunarisapp/ui/icons";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SyncStatusIndicator, { StatusTrigger } from "./index";

const mockUseSyncAccess = vi.fn();
const mockUseSyncBlockerState = vi.fn();
const mockUseSyncBlocker = vi.fn();
const mockUsePowerSync = vi.fn();
const mockClearUploadQueue = vi.fn();
const mockUseStatus = vi.fn();
const mockNavigate = vi.fn();
const mockUseActiveOrganization = vi.fn();

vi.mock("@repo/data/core", () => ({
  clearUploadQueue: (...args: unknown[]) => mockClearUploadQueue(...args),
  usePowerSync: () => mockUsePowerSync(),
  useSyncAccess: () => mockUseSyncAccess(),
  useSyncBlocker: () => mockUseSyncBlocker(),
  useSyncBlockerState: () => mockUseSyncBlockerState(),
}));

vi.mock("@repo/data/features/sync-status", () => ({
  useStatus: () => mockUseStatus(),
}));

vi.mock("../auth/context", () => ({
  useAuth: () => ({ useActiveOrganization: mockUseActiveOrganization }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@lunarisapp/ui/components/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@lunarisapp/ui/components/hover-card", () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({
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
  HoverCardContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@lunarisapp/ui/components/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ render }: { render: ReactNode }) => <div>{render}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@lunarisapp/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
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

vi.mock("@lunarisapp/ui/icons", () => ({
  Alert02Icon: {},
  CloudOffIcon: {},
  HugeiconsIcon: () => <span data-testid="sync-icon" />,
  LockIcon: {},
}));

const TRANSLATIONS: Record<string, string> = {
  "syncStatus.onlineStatus": "Cloud sync connected",
  "syncStatus.localOnlyAnonymousStatus":
    "Cloud sync is off. Create an account to sync across devices.",
  "syncStatus.localOnlyAnonymousMode": "Cloud Sync Is Off",
  "syncStatus.localOnlyAnonymousMessage":
    "Your work stays on this device. Create an account to sync it across devices.",
  "syncStatus.localOnlyAnonymousAction": "Create Account",
  "syncStatus.blockedStatus": "Sync paused after repeated upload failures",
  "syncStatus.blockedMode": "Sync Paused",
  "syncStatus.blockedMessage":
    "Several uploads failed, so sync paused for this session. Retry sync, or discard pending uploads if the problem continues.",
  "syncStatus.blockedAuthStatus": "Sync paused. Sign in again to continue.",
  "syncStatus.blockedAuthMode": "Sign In to Resume Sync",
  "syncStatus.blockedAuthMessage":
    "Your session expired. Sign in again, then retry sync.",
  "syncStatus.blockedAuthAction": "Sign In",
  "syncStatus.blockedPermissionStatus":
    "Sync paused by a plan or permission issue",
  "syncStatus.blockedPermissionMode": "Sync Needs Access",
  "syncStatus.blockedPermissionMessage":
    "Your plan or permissions do not allow sync. Review billing or ask an organization admin, then retry sync.",
  "syncStatus.blockedPermissionAction": "Review Billing",
  "syncStatus.transientErrorStatus":
    "Sync interrupted. Retrying automatically.",
  "syncStatus.transientErrorMode": "Sync Interrupted",
  "syncStatus.transientErrorMessage":
    "Lunaris cannot reach the sync service. It will keep retrying.",
  "settings.local-data.tryAgain": "Retry Sync",
  "settings.local-data.clearQueue": "Discard Pending Uploads",
  "settings.local-data.clearQueueConfirmTitle": "Discard pending uploads?",
  "settings.local-data.clearQueueConfirmDescription":
    "This permanently discards every pending upload and its unsynced changes. This cannot be undone.",
  "common.cancel": "Cancel",
  "syncStatus.offlineStatus":
    "You are offline. Changes will sync when you reconnect.",
  "syncStatus.offlineMode": "You Are Offline",
  "syncStatus.offlineMessage":
    "Keep working. Your changes will sync when you are back online.",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { date?: string; reason?: string }) => {
      if (key === "syncStatus.lastSynced") {
        return `Last synced: ${vars?.date ?? "-"}`;
      }
      if (key === "syncStatus.transientErrorReason") {
        return `Details: ${vars?.reason ?? ""}`;
      }
      return TRANSLATIONS[key] ?? key;
    },
  }),
}));

function setStatus(
  overrides: Partial<{
    connected: boolean;
    connecting: boolean;
    lastSyncedAt: Date | undefined;
    uploadError: Error | undefined;
    downloadError: Error | undefined;
  }>
) {
  mockUseStatus.mockReturnValue({
    connected: false,
    connecting: false,
    lastSyncedAt: undefined,
    dataFlowStatus: {
      uploadError: overrides.uploadError,
      downloadError: overrides.downloadError,
    },
    ...overrides,
  });
}

function defaults() {
  mockUseSyncAccess.mockReturnValue("cloud");
  mockUsePowerSync.mockReturnValue({});
  mockUseSyncBlocker.mockReturnValue({ resume: vi.fn() });
  mockUseSyncBlockerState.mockReturnValue({
    blocked: false,
    consecutiveClientErrors: 0,
    lastClientErrorStatus: null,
  });
  mockNavigate.mockReset();
  mockUseActiveOrganization.mockReturnValue({
    data: { id: "organization-1", slug: "northstar" },
  });
  setStatus({ connected: true });
}

describe("SyncStatusIndicator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders local-only anonymous variant with a Create Account CTA", async () => {
    const user = userEvent.setup();
    defaults();
    mockUseSyncAccess.mockReturnValue("local-only");
    setStatus({ connected: false, connecting: true });

    render(<SyncStatusIndicator />);

    const button = screen.getByRole("button", {
      name: "Cloud sync is off. Create an account to sync across devices.",
    });
    expect(button).toBeTruthy();
    expect(screen.getByText("Create Account")).toBeTruthy();

    await user.click(button);
    expect(mockNavigate).toHaveBeenCalledWith("/auth/register");
  });

  it("renders online state for connected cloud sync", () => {
    defaults();

    render(<SyncStatusIndicator />);

    expect(screen.getByText("Cloud sync connected")).toBeTruthy();
    expect(screen.queryByText("You Are Offline")).toBeNull();
  });

  it("renders offline state for disconnected cloud sync", () => {
    defaults();
    setStatus({
      connected: false,
      connecting: false,
      lastSyncedAt: new Date("2026-04-07T00:00:00Z"),
    });

    render(<SyncStatusIndicator />);

    expect(
      screen.getByText("You are offline. Changes will sync when you reconnect.")
    ).toBeTruthy();
    expect(screen.getByText("You Are Offline")).toBeTruthy();
    expect(
      screen.getByText(
        "Keep working. Your changes will sync when you are back online."
      )
    ).toBeTruthy();
    expect(screen.getByText(/Last synced: .*2026/)).toBeTruthy();
  });

  it("renders offline immediately when browser connectivity is lost", () => {
    defaults();
    let online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    setStatus({ connected: true });

    render(<SyncStatusIndicator />);

    expect(screen.getByText("Cloud sync connected")).toBeTruthy();

    act(() => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    });

    expect(
      screen.getByText("You are offline. Changes will sync when you reconnect.")
    ).toBeTruthy();
    expect(screen.getByText("You Are Offline")).toBeTruthy();
  });

  it("hides status while cloud sync is still connecting", () => {
    defaults();
    setStatus({ connected: false, connecting: true });

    render(<SyncStatusIndicator />);

    expect(
      screen.queryByText(
        "You are offline. Changes will sync when you reconnect."
      )
    ).toBeNull();
    expect(screen.queryByText("You Are Offline")).toBeNull();
    expect(screen.queryByTestId("sync-icon")).toBeNull();
  });

  it("renders blocked-auth variant with a Sign In CTA when last error was 401", async () => {
    const user = userEvent.setup();
    defaults();
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 401,
    });
    setStatus({
      connected: false,
      lastSyncedAt: new Date("2026-04-07T00:00:00Z"),
    });

    render(<SyncStatusIndicator />);

    expect(
      screen.getByText("Sync paused. Sign in again to continue.")
    ).toBeTruthy();
    expect(screen.getByText("Sign In to Resume Sync")).toBeTruthy();
    expect(
      screen.getByText("Your session expired. Sign in again, then retry sync.")
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("renders blocked-permission variant with a Review Billing CTA when last error was 403", async () => {
    const user = userEvent.setup();
    defaults();
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 403,
    });
    setStatus({
      connected: false,
      lastSyncedAt: new Date("2026-04-07T00:00:00Z"),
    });

    render(<SyncStatusIndicator />);

    expect(
      screen.getByText("Sync paused by a plan or permission issue")
    ).toBeTruthy();
    expect(screen.getByText("Sync Needs Access")).toBeTruthy();
    expect(
      screen.getByText(
        "Your plan or permissions do not allow sync. Review billing or ask an organization admin, then retry sync."
      )
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Review Billing" }));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/northstar/settings?tab=billing"
    );
  });

  it("renders generic blocked variant for other client errors", () => {
    defaults();
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 409,
    });
    setStatus({
      connected: false,
      lastSyncedAt: new Date("2026-04-07T00:00:00Z"),
    });

    render(<SyncStatusIndicator />);

    expect(
      screen.getByText("Sync paused after repeated upload failures")
    ).toBeTruthy();
    expect(screen.getByText("Sync Paused")).toBeTruthy();
    expect(
      screen.getByText(
        "Several uploads failed, so sync paused for this session. Retry sync, or discard pending uploads if the problem continues."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Sync" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Discard Pending Uploads" })
    ).toBeTruthy();
  });

  it("wires blocked sync actions to resume and clear queue", async () => {
    const user = userEvent.setup();
    const resume = vi.fn();
    const db = {};
    defaults();
    mockUsePowerSync.mockReturnValue(db);
    mockUseSyncBlocker.mockReturnValue({ resume });
    mockUseSyncBlockerState.mockReturnValue({
      blocked: true,
      consecutiveClientErrors: 3,
      lastClientErrorStatus: 409,
    });
    setStatus({
      connected: false,
      lastSyncedAt: new Date("2026-04-07T00:00:00Z"),
    });
    mockClearUploadQueue.mockResolvedValue(undefined);

    render(<SyncStatusIndicator />);

    await user.click(screen.getByRole("button", { name: "Retry Sync" }));
    expect(resume).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Discard Pending Uploads" })
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
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("renders transient-error variant when connected but upload errored", async () => {
    const user = userEvent.setup();
    const resume = vi.fn();
    defaults();
    mockUseSyncBlocker.mockReturnValue({ resume });
    setStatus({
      connected: true,
      uploadError: new Error("Server returned 502"),
    });

    render(<SyncStatusIndicator />);

    expect(
      screen.getByText("Sync interrupted. Retrying automatically.")
    ).toBeTruthy();
    expect(screen.getByText("Sync Interrupted")).toBeTruthy();
    expect(
      screen.getByText(
        "Lunaris cannot reach the sync service. It will keep retrying."
      )
    ).toBeTruthy();
    expect(screen.getByText("Details: Server returned 502")).toBeTruthy();
    expect(screen.queryByText("Last synced: -")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry Sync" }));
    expect(resume).toHaveBeenCalledTimes(1);
  });
});

describe("StatusTrigger", () => {
  it("forwards injected trigger props (onClick, data-state, aria-*) to the underlying button", async () => {
    // Regression for #133: Base UI's <Trigger render={element} /> uses
    // React.cloneElement to inject hover/click handlers. If StatusTrigger
    // drops props, the popover/hover panel never opens.
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <StatusTrigger
        aria-expanded
        data-state="open"
        icon={{} as IconSvgObject}
        onClick={onClick}
        srLabel="Trigger label"
        tone="warning"
      />
    );

    const button = screen.getByRole("button", { name: "Trigger label" });
    expect(button.getAttribute("data-state")).toBe("open");
    expect(button.getAttribute("aria-expanded")).toBe("true");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
