import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingSection } from "./billing-section";

const {
  api,
  auth,
  entitlementStatus,
  refreshEntitlements,
  region,
  toastError,
} = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  auth: {
    useSession: vi.fn(),
  },
  entitlementStatus: {
    billingManagement: "polar" as "polar" | "unavailable",
    displayPlan: "business",
    freshness: "live" as "live" | "cached" | "expired" | "unverified",
    isOnline: true,
    verifiedAt: "2026-07-16T10:00:00.000Z" as string | null,
  },
  refreshEntitlements: vi.fn(),
  region: { id: "eu" },
  toastError: vi.fn(),
}));

vi.mock("../../api", () => ({ useApi: () => api }));
vi.mock("../../auth", () => ({ useAuth: () => auth }));
vi.mock("../../entitlements", () => ({
  useEntitlementStatus: () => entitlementStatus,
  useRefreshEntitlements: () => refreshEntitlements,
}));
vi.mock("../../region", () => ({ useRegion: () => ({ region }) }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (
      key: string,
      options?: { count?: number; date?: string; name?: string }
    ) => {
      const labels: Record<string, string> = {
        "organization.billing.active": "Active",
        "organization.billing.annualBilling": "Annual",
        "organization.billing.billingDetailsUnavailable":
          "Billing details are currently unavailable",
        "organization.billing.cached": "Cached",
        "organization.billing.choosePlan": `Choose ${options?.name ?? ""}`,
        "organization.billing.choosePlanTitle": "Choose a plan",
        "organization.billing.currentPlan": "Current Plan",
        "organization.billing.description": "Manage subscription",
        "organization.billing.error": "Failed to load billing information",
        "organization.billing.freePlanDescription": "Free plan",
        "organization.billing.lastVerified": `Last verified ${options?.date ?? ""}`,
        "organization.billing.manage": "Manage Billing",
        "organization.billing.monthly": "month",
        "organization.billing.monthlyBilling": "Monthly",
        "organization.billing.perMemberMonth": "per member / month",
        "organization.billing.renewsOn": "Renews on",
        "organization.billing.retry": "Retry",
        "organization.billing.seatsTaken": `${options?.count ?? ""} seats taken`,
        "organization.billing.seatsUnavailable": "Seat count unavailable",
        "organization.billing.title": "Billing",
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderBilling({ isOwner = true }: { isOwner?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <BillingSection isOwner={isOwner} organizationId="organization-1" />
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

describe("BillingSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.useSession.mockReturnValue({
      data: { user: { id: "user-1", isAnonymous: false } },
      isPending: false,
    });
    api.get.mockResolvedValue({ activeSubscriptions: [] });
    api.post.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/entitlements/checkout"
          ? { url: "https://checkout.example/session" }
          : path === "/v1/entitlements/portal"
            ? { url: "https://billing.example/portal" }
            : { success: true }
      )
    );
    entitlementStatus.billingManagement = "polar";
    entitlementStatus.displayPlan = "business";
    entitlementStatus.freshness = "live";
    entitlementStatus.isOnline = true;
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  it("uses sequential heading levels for billing content", () => {
    renderBilling();

    expect(
      screen.getByRole("heading", { level: 2, name: "Current Plan" })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Choose a plan" })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Plus" })
    ).toBeTruthy();
  });

  it("shows a cached plan offline without calling Polar", () => {
    entitlementStatus.freshness = "cached";
    entitlementStatus.isOnline = false;
    onlineManager.setOnline(false);

    renderBilling();

    expect(screen.getByText("Business")).toBeTruthy();
    expect(screen.getByText("Cached")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Manage Billing" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(screen.queryByText("Choose a plan")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("hides billing actions when Polar is unavailable", () => {
    entitlementStatus.billingManagement = "unavailable";

    renderBilling();

    expect(screen.getAllByText("Business").length).toBeGreaterThan(0);
    expect(screen.queryByText("Manage Billing")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("refreshes usage without fetching billing when Polar is unavailable", async () => {
    entitlementStatus.billingManagement = "unavailable";
    renderBilling();
    await userEvent.click(
      screen.getByRole("button", { name: "common.refresh" })
    );
    expect(refreshEntitlements).toHaveBeenCalledOnce();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows the Enterprise plan name", () => {
    entitlementStatus.displayPlan = "enterprise";

    renderBilling();

    expect(screen.getByText("Enterprise")).toBeTruthy();
    expect(screen.queryByText("enterprise")).toBeNull();
  });

  it("scopes billing state by region, user, and organization", async () => {
    const { queryClient } = renderBilling();

    await waitFor(() =>
      expect(
        queryClient.getQueryState([
          "organization",
          "organization-1",
          "billing",
          "state",
          "eu",
          "user-1",
        ])?.status
      ).toBe("success")
    );
  });

  it("shows total subscription charge with taken seat count", async () => {
    api.get.mockResolvedValue({
      activeSubscriptions: [
        {
          amount: 4800,
          cancelAtPeriodEnd: false,
          currency: "USD",
          currentPeriodEnd: "2026-08-16T10:00:00.000Z",
          id: "subscription-1",
          productId: "business-monthly",
          recurringInterval: "month",
          seats: 3,
          status: "active",
        },
      ],
    });

    renderBilling();

    expect(
      await screen.findByText(/\$48\.00 \/ month · 3 seats taken/)
    ).toBeTruthy();
  });

  it("does not invent a seat count when Polar omits it", async () => {
    api.get.mockResolvedValue({
      activeSubscriptions: [
        {
          amount: 1600,
          cancelAtPeriodEnd: false,
          currency: "USD",
          currentPeriodEnd: "2026-08-16T10:00:00.000Z",
          id: "subscription-1",
          productId: "business-monthly",
          recurringInterval: "month",
          seats: null,
          status: "active",
        },
      ],
    });

    renderBilling();

    expect(await screen.findByText(/Seat count unavailable/)).toBeTruthy();
    expect(screen.queryByText(/1 seat taken/)).toBeNull();
  });

  it("waits for the session before querying billing state", () => {
    auth.useSession.mockReturnValue({ data: null, isPending: true });

    renderBilling();

    expect(api.get).not.toHaveBeenCalled();
  });

  it("keeps the authoritative paid plan visible when Polar fails", async () => {
    api.get.mockRejectedValue(new Error("Polar unavailable"));

    renderBilling();

    expect(screen.getAllByText("Business").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        screen.getByText("Failed to load billing information")
      ).toBeTruthy()
    );
  });

  it("starts annual checkout through the organization API", async () => {
    const user = userEvent.setup();
    const assign = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => undefined);
    entitlementStatus.displayPlan = "free";

    renderBilling();
    await user.click(
      await screen.findByRole("button", { name: "Choose Plus" })
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/v1/entitlements/checkout", {
        body: { interval: "year", plan: "plus" },
      })
    );
    expect(assign).toHaveBeenCalledWith("https://checkout.example/session");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("switches billing interval within one connected picker", async () => {
    const user = userEvent.setup();
    entitlementStatus.displayPlan = "free";

    renderBilling();

    const intervalPicker = screen.getByRole("group", {
      name: "Choose a plan",
    });
    const monthly = screen.getByRole("button", { name: "Monthly" });
    const annual = screen.getByRole("button", { name: "Annual" });

    expect(intervalPicker.contains(monthly)).toBe(true);
    expect(intervalPicker.contains(annual)).toBe(true);
    expect(annual.getAttribute("aria-pressed")).toBe("true");

    await user.click(monthly);

    expect(monthly.getAttribute("aria-pressed")).toBe("true");
    expect(annual.getAttribute("aria-pressed")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Choose Plus" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/v1/entitlements/checkout", {
        body: { interval: "month", plan: "plus" },
      })
    );
  });

  it("crosses out monthly prices when annual billing is selected", async () => {
    const user = userEvent.setup();
    entitlementStatus.displayPlan = "free";

    renderBilling();

    expect(screen.getByText("$10.00", { selector: "s" })).toBeTruthy();
    expect(screen.getByText("$20.00", { selector: "s" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Monthly" }));

    expect(screen.queryByText("$10.00", { selector: "s" })).toBeNull();
    expect(screen.queryByText("$20.00", { selector: "s" })).toBeNull();
  });

  it("changes paid plans through the API and keeps portal management", async () => {
    const user = userEvent.setup();
    entitlementStatus.displayPlan = "plus";

    renderBilling();
    await screen.findByRole("button", { name: "Choose Business" });
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    api.get.mockClear();

    await user.click(screen.getByRole("button", { name: "Choose Business" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/v1/entitlements/change-plan", {
        body: { interval: "year", plan: "business" },
      })
    );
    expect(refreshEntitlements).toHaveBeenCalledOnce();
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());

    const assign = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => undefined);
    await user.click(screen.getByRole("button", { name: "Manage Billing" }));

    expect(api.post).toHaveBeenCalledWith("/v1/entitlements/portal");
    expect(assign).toHaveBeenCalledWith("https://billing.example/portal");
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a plan")).toBeTruthy();
  });

  it("shows feedback when the billing portal fails", async () => {
    const user = userEvent.setup();
    entitlementStatus.displayPlan = "plus";
    api.post.mockRejectedValue(new Error("Portal unavailable"));

    renderBilling();
    await user.click(
      await screen.findByRole("button", { name: "Manage Billing" })
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Failed to load billing information"
      )
    );
  });

  it("shows plan details without owner actions to organization members", async () => {
    entitlementStatus.displayPlan = "plus";

    renderBilling({ isOwner: false });

    expect(await screen.findByText("Plus")).toBeTruthy();
    expect(screen.queryByText("Manage Billing")).toBeNull();
    expect(screen.queryByText("Choose a plan")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});
