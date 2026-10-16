import {
  type EntitlementSnapshot,
  FEATURE,
  PLAN,
  type PlanSlug,
  resolveEntitlements,
} from "@repo/auth/entitlements";
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EntitlementsProvider,
  type ReserveResourceCapacity,
  useEntitlementStatus,
  useEntitlements,
  useFeatureAccess,
  useReserveResourceCapacity,
} from "./context";
import {
  clearEntitlementSnapshots,
  readEntitlementSnapshot,
  writeEntitlementSnapshot,
} from "./snapshot";

const { api, auth, getOrganizationWorkspaceResourceUsage, region } = vi.hoisted(
  () => ({
    api: { get: vi.fn() },
    auth: { useActiveOrganization: vi.fn(), useSession: vi.fn() },
    getOrganizationWorkspaceResourceUsage: vi.fn(),
    region: { id: "eu" },
  })
);

vi.mock("@repo/data/core", () => ({ usePowerSync: () => ({ id: "db" }) }));
vi.mock("@repo/data/features/workspace-resources", () => ({
  getOrganizationWorkspaceResourceUsage,
}));
vi.mock("../api", () => ({ useApi: () => api }));
vi.mock("../auth/context", () => ({ useAuth: () => auth }));
vi.mock("../region", () => ({ useRegion: () => ({ region }) }));

function makeSnapshot(
  plan: PlanSlug,
  organizationId = "organization-1",
  overrides: Partial<EntitlementSnapshot> = {}
): EntitlementSnapshot {
  const resolved = resolveEntitlements(plan);
  return {
    billingManagement: "unavailable",
    features: { "agent-work": false },
    resourceCount: 0,
    limits: { ...resolved.limits },
    offlineAccessUntil: null,
    plan,
    verifiedAt: "2026-07-19T10:00:00.000Z",
    organizationId,
    ...overrides,
  };
}

let reserveResourceCapacity: ReserveResourceCapacity;

function Probe() {
  const { plan } = useEntitlements();
  const agentWork = useFeatureAccess(FEATURE.agentWork);
  const status = useEntitlementStatus();
  reserveResourceCapacity = useReserveResourceCapacity();
  return (
    <div>
      <span data-testid="effective-plan">{plan}</span>
      <span data-testid="display-plan">{status.displayPlan}</span>
      <span data-testid="agentWork-access">{String(agentWork.allowed)}</span>
      <span data-testid="agentWork-pending">{String(agentWork.pending)}</span>
      <span>{status.freshness}</span>
      <span data-testid="usage">{JSON.stringify(status.usage)}</span>
    </div>
  );
}

function renderProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

describe("organization entitlement snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.useSession.mockReturnValue({
      data: { user: { id: "user-1", isAnonymous: false } },
    });
    auth.useActiveOrganization.mockReturnValue({
      data: { id: "organization-1" },
    });
    api.get.mockResolvedValue(makeSnapshot(PLAN.free));
    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 0,
      syncedCount: 0,
    });
  });

  afterEach(() => {
    clearEntitlementSnapshots();
    onlineManager.setOnline(true);
  });

  it("keeps verified usage limits with an expired plan snapshot", () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus, "organization-1", {
        resourceCount: 42,
        memberCount: 4,
        pendingInvitationCount: 2,
        offlineAccessUntil: "2020-01-01T00:00:00.000Z",
      })
    );
    onlineManager.setOnline(false);
    renderProbe();
    expect(screen.getByTestId("effective-plan").textContent).toBe(PLAN.free);
    expect(JSON.parse(screen.getByTestId("usage").textContent!)).toEqual({
      resourceCount: 42,
      memberCount: 4,
      pendingInvitationCount: 2,
      maxResources: Number.MAX_SAFE_INTEGER,
      maxMembers: 10,
    });
  });

  it("uses cached organization plan offline", () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus)
    );
    onlineManager.setOnline(false);
    renderProbe();

    expect(screen.getByTestId("effective-plan").textContent).toBe(PLAN.plus);
    expect(screen.getByText("cached")).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("uses only live snapshots for Agent Work access", async () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus, "organization-1", {
        features: { "agent-work": true },
      })
    );
    onlineManager.setOnline(false);
    const offline = renderProbe();

    expect(screen.getByTestId("agentWork-access").textContent).toBe("false");
    offline.unmount();

    onlineManager.setOnline(true);
    api.get.mockResolvedValue(
      makeSnapshot(PLAN.plus, "organization-1", {
        features: { "agent-work": true },
      })
    );
    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("agentWork-access").textContent).toBe("true")
    );
  });

  it("removes Agent Work access when a live refresh fails", async () => {
    api.get.mockResolvedValue(
      makeSnapshot(PLAN.plus, "organization-1", {
        features: { "agent-work": true },
      })
    );
    const { queryClient } = renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("agentWork-access").textContent).toBe("true")
    );

    api.get.mockRejectedValue(new Error("entitlements unavailable"));
    await queryClient.invalidateQueries({
      queryKey: [
        "entitlements",
        "organization",
        "eu",
        "user-1",
        "organization-1",
      ],
    });

    await waitFor(() =>
      expect(screen.getByTestId("agentWork-access").textContent).toBe("false")
    );
  });

  it("reconciles a canceled organization to Free", async () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus)
    );
    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("effective-plan").textContent).toBe(PLAN.free)
    );
  });

  it("does not reuse another organization plan", () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-2",
      makeSnapshot(PLAN.business, "organization-2")
    );
    onlineManager.setOnline(false);
    renderProbe();

    expect(screen.getByTestId("effective-plan").textContent).toBe(PLAN.free);
  });

  it("rejects a live snapshot for another organization", async () => {
    api.get.mockResolvedValue(makeSnapshot(PLAN.business, "organization-2"));
    const { queryClient } = renderProbe();

    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          "entitlements",
          "organization",
          "eu",
          "user-1",
          "organization-1",
        ])?.status
      ).toBe("error")
    );

    expect(screen.getByTestId("effective-plan").textContent).toBe(PLAN.free);
    expect(
      readEntitlementSnapshot("eu", "user-1", "organization-1")
    ).toBeNull();
  });

  it("reserves resource capacity using a current API snapshot", async () => {
    api.get.mockResolvedValue(
      makeSnapshot(PLAN.free, "organization-1", { resourceCount: 24 })
    );
    const { queryClient } = renderProbe();
    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          "entitlements",
          "organization",
          "eu",
          "user-1",
          "organization-1",
        ])?.status
      ).toBe("success")
    );

    const reservation = await reserveResourceCapacity();
    await expect(reserveResourceCapacity()).rejects.toMatchObject({
      limit: 25,
    });
    reservation.rollback();
    expect(
      readEntitlementSnapshot("eu", "user-1", "organization-1")
    ).toMatchObject({
      resourceCount: 24,
      limits: { max_resources: 25 },
    });
  });

  it("blocks item 26 using the authoritative organization count", async () => {
    api.get.mockResolvedValue(
      makeSnapshot(PLAN.free, "organization-1", { resourceCount: 25 })
    );
    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 5,
      syncedCount: 5,
    });
    const { queryClient } = renderProbe();

    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          "entitlements",
          "organization",
          "eu",
          "user-1",
          "organization-1",
        ])?.status
      ).toBe("success")
    );

    await expect(reserveResourceCapacity()).rejects.toMatchObject({
      limit: 25,
      name: "ResourceCapacityExceededError",
    });
  });

  it("counts committed and in-flight reservations without double booking", async () => {
    api.get.mockResolvedValue(
      makeSnapshot(PLAN.free, "organization-1", { resourceCount: 24 })
    );
    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 24,
      syncedCount: 24,
    });
    const { queryClient } = renderProbe();

    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          "entitlements",
          "organization",
          "eu",
          "user-1",
          "organization-1",
        ])?.status
      ).toBe("success")
    );

    const first = await reserveResourceCapacity();
    await expect(reserveResourceCapacity()).rejects.toMatchObject({
      limit: 25,
    });

    first.rollback();
    const replacement = await reserveResourceCapacity();
    replacement.commit();
    await expect(reserveResourceCapacity()).rejects.toMatchObject({
      limit: 25,
    });
  });

  it("reconciles server refreshes and confirmed deletions", async () => {
    api.get.mockResolvedValue(
      makeSnapshot(PLAN.free, "organization-1", { resourceCount: 24 })
    );
    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 24,
      syncedCount: 24,
    });
    const { queryClient } = renderProbe();

    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          "entitlements",
          "organization",
          "eu",
          "user-1",
          "organization-1",
        ])?.status
      ).toBe("success")
    );

    const created = await reserveResourceCapacity();
    created.commit();

    api.get.mockResolvedValue(
      makeSnapshot(PLAN.free, "organization-1", { resourceCount: 25 })
    );
    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 25,
      syncedCount: 25,
    });
    await expect(reserveResourceCapacity()).rejects.toMatchObject({
      limit: 25,
    });

    api.get.mockResolvedValue(
      makeSnapshot(PLAN.free, "organization-1", { resourceCount: 24 })
    );
    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 24,
      syncedCount: 24,
    });
    const replacement = await reserveResourceCapacity();
    replacement.rollback();
  });

  it("frees local-only capacity after deletion", async () => {
    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 25,
      syncedCount: 0,
    });
    renderProbe();

    await expect(reserveResourceCapacity()).rejects.toMatchObject({
      limit: 25,
    });

    getOrganizationWorkspaceResourceUsage.mockResolvedValue({
      localCount: 24,
      syncedCount: 0,
    });
    const replacement = await reserveResourceCapacity();
    replacement.rollback();
  });

  it("skips counting for an unlimited plan", async () => {
    api.get.mockResolvedValue(
      makeSnapshot(PLAN.plus, "organization-1", { resourceCount: 100 })
    );
    const { queryClient } = renderProbe();

    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          "entitlements",
          "organization",
          "eu",
          "user-1",
          "organization-1",
        ])?.status
      ).toBe("success")
    );

    const reservation = await reserveResourceCapacity();
    reservation.commit();
    expect(getOrganizationWorkspaceResourceUsage).not.toHaveBeenCalled();
  });

  it("keeps expired plan visible while paid access falls back to Free", () => {
    writeEntitlementSnapshot(
      "eu",
      "user-1",
      "organization-1",
      makeSnapshot(PLAN.plus, "organization-1", {
        offlineAccessUntil: "2020-01-01T00:00:00.000Z",
      })
    );
    onlineManager.setOnline(false);
    renderProbe();

    expect(screen.getByTestId("effective-plan").textContent).toBe(PLAN.free);
    expect(screen.getByTestId("display-plan").textContent).toBe(PLAN.plus);
    expect(screen.getByText("expired")).toBeTruthy();
  });
});
