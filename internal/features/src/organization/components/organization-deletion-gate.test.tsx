import { ApiError } from "@repo/data/http";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OrganizationDeletionGate,
  organizationDeletionKey,
  organizationDeletionRedirectKey,
  type OrganizationDeletionStatus,
} from "./organization-deletion-gate";

const { navigate, post, clearContent, db, syncSession, syncBlocker } =
  vi.hoisted(() => ({
    navigate: vi.fn(),
    post: vi.fn(),
    clearContent: vi.fn(),
    db: {},
    syncSession: { disconnect: vi.fn(), connect: vi.fn() },
    syncBlocker: { resume: vi.fn() },
  }));
vi.mock("react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@repo/features/region", () => ({
  useRegion: () => ({ pathWithRegion: (path: string) => `${path}?region=us` }),
}));
vi.mock("@repo/features/api", () => ({ useApi: () => ({ post }) }));
vi.mock("@repo/data/core", () => ({
  usePowerSync: () => db,
  usePowerSyncSession: () => syncSession,
  useSyncBlocker: () => syncBlocker,
}));
vi.mock("@repo/data/features/organizations", () => ({
  discardOrganizationUploads: clearContent,
}));
vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <div>Loading</div>,
}));
vi.mock("./organization-selector", () => ({
  OrganizationSelector: () => (
    <button type="button">Switch organization</button>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const scheduled: OrganizationDeletionStatus = {
  success: true,
  status: "scheduled",
  purgeAfter: "2026-10-08T12:00:00.000Z",
  canRestore: true,
  billingStopped: true,
  workspaceIds: ["workspace-1"],
};
const active: OrganizationDeletionStatus = {
  ...scheduled,
  status: "active",
  purgeAfter: null,
  canRestore: false,
  workspaceIds: [],
};
function mount(
  options: {
    isAnonymous?: boolean;
    purgeAfter?: string;
    requestedAt?: string;
    initialStatus?: OrganizationDeletionStatus | null;
    redirect?: string;
  } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const initialStatus =
    options.initialStatus === undefined ? scheduled : options.initialStatus;
  if (initialStatus) {
    client.setQueryData(organizationDeletionKey("org-1"), initialStatus);
  }
  if (options.redirect) {
    client.setQueryData(
      organizationDeletionRedirectKey("org-1"),
      options.redirect
    );
  }
  const content = (props: typeof options) => (
    <QueryClientProvider client={client}>
      <OrganizationDeletionGate
        organizationId="org-1"
        isAnonymous={props.isAnonymous ?? false}
        purgeAfter={props.purgeAfter}
        requestedAt={props.requestedAt}
      >
        <div>Private content</div>
      </OrganizationDeletionGate>
    </QueryClientProvider>
  );
  const view = render(content(options));
  return {
    client,
    rerender: (props: typeof options) => view.rerender(content(props)),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  clearContent.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  onlineManager.setOnline(true);
  focusManager.setFocused(true);
});
describe("OrganizationDeletionGate", () => {
  it("hides content, clears cache, and restores via authorized endpoint", async () => {
    post.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("restore") ? active : scheduled)
    );
    mount();
    await screen.findByText("organization.deletionScheduledTitle");
    expect(screen.queryByText("Private content")).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "organization.deletionScheduledTitle",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "organization.billing.title" })
    ).toBeTruthy();
    await waitFor(() =>
      expect(clearContent).toHaveBeenCalledWith(db, "org-1", ["workspace-1"])
    );
    const restore = screen.getByRole("button", {
      name: "organization.restoreOrganization",
    });
    await waitFor(() =>
      expect((restore as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(restore);
    await screen.findByText("Private content");
    expect(post).toHaveBeenCalledWith("/v1/organization/restore", {
      body: { organizationId: "org-1" },
    });
  });
  it("switches after requested deletion cleanup completes", async () => {
    let finish!: () => void;
    clearContent.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    post.mockResolvedValue(scheduled);
    mount({ redirect: "active-org" });
    await waitFor(() => expect(clearContent).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    finish();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/active-org?region=us", {
        replace: true,
      })
    );
  });

  it.each([
    { canRestore: false },
    { status: "purging" as const, canRestore: false },
  ])("does not offer recovery when server disallows it: %j", async (fields) => {
    post.mockResolvedValue({ ...scheduled, ...fields });
    mount();
    await screen.findByText("organization.deletionScheduledTitle");
    expect(
      screen.queryByRole("button", {
        name: "organization.restoreOrganization",
      })
    ).toBeNull();
    expect(screen.queryByText("Private content")).toBeNull();
  });
  it("keeps a known suspended organization closed while offline", async () => {
    post.mockRejectedValue(new Error("offline"));
    mount({ purgeAfter: scheduled.purgeAfter!, initialStatus: null });
    await screen.findByText("organization.deletionActionFailed");
    expect(screen.queryByText("Private content")).toBeNull();
  });
  it("keeps offline-first content available for active organizations", async () => {
    post.mockRejectedValue(new Error("offline"));
    mount({ initialStatus: null });
    await screen.findByText("Private content");
    expect(clearContent).not.toHaveBeenCalled();
  });
  it("preserves local writes when an older server returns a route-level 404", async () => {
    post.mockRejectedValue(
      await ApiError.fromResponse(new Response("Not Found", { status: 404 }))
    );
    mount({ initialStatus: null, requestedAt: "2026-09-09" });
    await screen.findByText("organization.deletionActionFailed");
    expect(clearContent).not.toHaveBeenCalled();
  });
  it("discards uploads only on an explicit unavailable status", async () => {
    post.mockResolvedValue({ ...active, status: "unavailable" });
    mount();
    await screen.findByText("organization.deletionUnavailableTitle");
    await waitFor(() =>
      expect(clearContent).toHaveBeenCalledWith(db, "org-1", [])
    );
    expect(screen.queryByText("Private content")).toBeNull();
    expect(syncSession.disconnect).toHaveBeenCalled();
    await waitFor(() => expect(syncSession.connect).toHaveBeenCalled());
    expect(syncBlocker.resume).toHaveBeenCalled();
  });
  it("honors synced suspension even if the cached status says active", async () => {
    post.mockResolvedValue(active);
    mount({ purgeAfter: scheduled.purgeAfter! });
    await screen.findByText("organization.deletionScheduledTitle");
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(screen.queryByText("Private content")).toBeNull();
  });
  it("does not call cloud endpoints for anonymous users", async () => {
    mount({ isAnonymous: true });
    expect(screen.getByText("Private content")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});

async function advance(ms = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("sync-driven status requests", () => {
  it("never fetches healthy organizations on entry, rerender, focus, reconnect, or timers", async () => {
    vi.useFakeTimers();
    const { rerender } = mount({ initialStatus: null });
    rerender({});
    await act(async () => {
      focusManager.setFocused(false);
      onlineManager.setOnline(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(true);
    });
    await advance(60_000);
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText("Private content")).toBeTruthy();
  });

  it.each(["requestedAt", "purgeAfter"] as const)(
    "fetches when sync sets %s despite cached active status",
    async (field) => {
      post.mockResolvedValue(scheduled);
      const { rerender } = mount({ initialStatus: active });
      expect(post).not.toHaveBeenCalled();
      rerender({ [field]: scheduled.purgeAfter! });
      expect(screen.queryByText("Private content")).toBeNull();
      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(clearContent).toHaveBeenCalledTimes(1));
    }
  );

  it("reconciles remote restoration once and clears stale selector cache", async () => {
    post.mockResolvedValue(scheduled);
    const { client, rerender } = mount({ purgeAfter: scheduled.purgeAfter! });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(clearContent).toHaveBeenCalledTimes(1));
    post.mockResolvedValue(active);
    rerender({});
    await screen.findByText("Private content");
    expect(post).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(organizationDeletionKey("org-1"))).toEqual(
      active
    );
    rerender({});
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each(["active", "unavailable"] as const)(
    "stops polling after %s",
    async (status) => {
      vi.useFakeTimers();
      post.mockResolvedValue({ ...active, status });
      mount({ purgeAfter: scheduled.purgeAfter! });
      await advance();
      await advance(30_000);
      expect(post).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Private content")).toBeNull();
    }
  );

  it("polls recovery only while online and focused", async () => {
    vi.useFakeTimers();
    post.mockResolvedValue(scheduled);
    mount();
    await advance();
    expect(post).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(post).toHaveBeenCalledTimes(2);
    focusManager.setFocused(false);
    await advance(20_000);
    expect(post).toHaveBeenCalledTimes(2);
    focusManager.setFocused(true);
    await advance();
    expect(post).toHaveBeenCalledTimes(3);
    onlineManager.setOnline(false);
    await advance(20_000);
    expect(post).toHaveBeenCalledTimes(3);
    onlineManager.setOnline(true);
    await advance();
    expect(post).toHaveBeenCalledTimes(4);
  });

  it("reacts immediately to a local deletion cache update", async () => {
    post.mockResolvedValue(scheduled);
    const { client } = mount({ initialStatus: null });
    await act(async () => {
      client.setQueryData(organizationDeletionKey("org-1"), scheduled);
    });
    await screen.findByText("organization.deletionScheduledTitle");
    await waitFor(() => expect(clearContent).toHaveBeenCalledTimes(1));
  });
});

it("retries failed cleanup without repeatedly fetching terminal status", async () => {
  clearContent.mockRejectedValueOnce(new Error("storage failure"));
  post.mockResolvedValue({ ...active, status: "unavailable" });
  mount({ initialStatus: null, requestedAt: "2026-09-09" });
  const retry = await screen.findByRole("button", { name: "common.retry" });
  expect(clearContent).toHaveBeenCalledTimes(1);
  fireEvent.click(retry);
  await waitFor(() => expect(clearContent).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByText("organization.deletionActionFailed")).toBeNull()
  );
  expect(post).toHaveBeenCalledTimes(1);
});

it("retries recovery details after failure with a cached active response", async () => {
  vi.useFakeTimers();
  post.mockRejectedValueOnce(new Error("network"));
  post.mockResolvedValue(scheduled);
  const { rerender } = mount({ initialStatus: active });
  rerender({ requestedAt: "2026-09-09" });
  await advance();
  expect(post).toHaveBeenCalledTimes(1);
  expect(clearContent).not.toHaveBeenCalled();
  expect(screen.queryByText("Private content")).toBeNull();
  await advance(10_000);
  expect(post).toHaveBeenCalledTimes(2);
  expect(clearContent).toHaveBeenCalledTimes(1);
});

it("navigates when local deletion response arrives after sync cleanup", async () => {
  post.mockResolvedValue(scheduled);
  const { client } = mount({ requestedAt: "2026-09-09", initialStatus: null });
  await waitFor(() => expect(clearContent).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "organization.restoreOrganization",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  await act(async () => {
    client.setQueryData(organizationDeletionRedirectKey("org-1"), "next-org");
    client.setQueryData(organizationDeletionKey("org-1"), scheduled);
  });
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith("/next-org?region=us", {
      replace: true,
    })
  );
  expect(clearContent).toHaveBeenCalledTimes(1);
});

it("retains pending redirect across slow cleanup", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  clearContent.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  post.mockResolvedValue(scheduled);
  mount({ redirect: "next-org" });
  await advance();
  await advance(6 * 60_000);
  await act(async () => {
    finish();
  });
  await advance();
  expect(navigate).toHaveBeenCalledWith("/next-org?region=us", {
    replace: true,
  });
});

it("does not let an old status response overwrite successful restoration", async () => {
  let finishStatus!: (status: OrganizationDeletionStatus) => void;
  post.mockImplementation((path: string) =>
    path.endsWith("restore")
      ? Promise.resolve(active)
      : new Promise<OrganizationDeletionStatus>((resolve) => {
          finishStatus = resolve;
        })
  );
  const { client } = mount();
  const restore = screen.getByRole("button", {
    name: "organization.restoreOrganization",
  });
  await waitFor(() =>
    expect((restore as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(restore);
  await screen.findByText("Private content");
  await act(async () => {
    finishStatus(scheduled);
  });
  await waitFor(() =>
    expect(client.getQueryData(organizationDeletionKey("org-1"))).toEqual(
      active
    )
  );
  expect(screen.getByText("Private content")).toBeTruthy();
});

it("starts fresh reconciliation when restoration sync overtakes a pending status request", async () => {
  let finishOldStatus!: (status: OrganizationDeletionStatus) => void;
  post.mockImplementationOnce(
    () =>
      new Promise<OrganizationDeletionStatus>((resolve) => {
        finishOldStatus = resolve;
      })
  );
  post.mockResolvedValue(active);
  const { client, rerender } = mount({ requestedAt: "2026-09-09" });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  rerender({});
  await screen.findByText("Private content");
  await act(async () => {
    finishOldStatus(scheduled);
  });
  expect(client.getQueryData(organizationDeletionKey("org-1"))).toEqual(active);
  expect(post).toHaveBeenCalledTimes(2);
});

it("reconciles restoration before the first recovery response arrives", async () => {
  let finishOldStatus!: (status: OrganizationDeletionStatus) => void;
  post.mockImplementationOnce(
    () =>
      new Promise<OrganizationDeletionStatus>((resolve) => {
        finishOldStatus = resolve;
      })
  );
  post.mockResolvedValue(active);
  const { client, rerender } = mount({
    requestedAt: "2026-09-09",
    initialStatus: null,
  });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  rerender({});
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  await act(async () => {
    finishOldStatus(scheduled);
  });
  expect(client.getQueryData(organizationDeletionKey("org-1"))).toEqual(active);
  expect(clearContent).not.toHaveBeenCalled();
});

it("does not resume terminal polling after a failed remount check", async () => {
  vi.useFakeTimers();
  post.mockRejectedValue(new Error("network"));
  mount({
    requestedAt: "2026-09-09",
    initialStatus: { ...active, status: "unavailable" },
  });
  await advance();
  expect(post).toHaveBeenCalledTimes(1);
  await advance(30_000);
  expect(post).toHaveBeenCalledTimes(1);
});

it("pauses status polling throughout a pending restoration", async () => {
  vi.useFakeTimers();
  let finishRestore!: (status: OrganizationDeletionStatus) => void;
  post.mockImplementation((path: string) =>
    path.endsWith("restore")
      ? new Promise<OrganizationDeletionStatus>((resolve) => {
          finishRestore = resolve;
        })
      : Promise.resolve(scheduled)
  );
  mount();
  await advance();
  fireEvent.click(
    screen.getByRole("button", { name: "organization.restoreOrganization" })
  );
  await advance();
  await advance(30_000);
  expect(
    post.mock.calls.filter(([path]) => path.endsWith("deletion-status"))
  ).toHaveLength(1);
  await act(async () => {
    finishRestore(active);
  });
  await advance();
  expect(screen.getByText("Private content")).toBeTruthy();
});
