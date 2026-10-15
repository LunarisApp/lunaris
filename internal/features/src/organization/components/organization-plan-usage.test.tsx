import { UNLIMITED } from "@repo/auth/entitlements";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EntitlementStatus } from "../../entitlements";
import en from "../../locale/locales/en.json";
import { OrganizationPlanUsage } from "./organization-plan-usage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, values: Record<string, string> = {}) => {
      const label =
        key === "organization.members"
          ? en.organization.members
          : en.organization.billing[
              key.replace("organization.billing.", "") as keyof typeof en.organization.billing
            ];
      return label.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? "");
    },
  }),
}));

const status = {
  billingManagement: "unavailable",
  displayPlan: "free",
  freshness: "live",
  isOnline: true,
  verifiedAt: null,
  usage: {
    resourceCount: 12,
    maxResources: 25,
    memberCount: 2,
    pendingInvitationCount: 1,
    maxMembers: 3,
  },
} satisfies EntitlementStatus;

describe("organization plan usage", () => {
  it("shows member details on hover and keeps capacity visible", async () => {
    render(<OrganizationPlanUsage status={status} />);
    expect(screen.getByRole("progressbar", { name: "Members" }).getAttribute("aria-valuenow")).toBe(
      "3",
    );
    expect(
      screen.queryByText("2 accepted · 1 invitation reservations. Owner included."),
    ).toBeNull();
    await userEvent.hover(screen.getByRole("button", { name: "Members" }));
    expect(await screen.findByRole("tooltip")).toHaveProperty(
      "textContent",
      "2 accepted · 1 invitation reservations. Owner included.",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    expect(screen.queryByText(en.organization.billing.storagePrivacy)).toBeNull();
    expect(screen.getByText("Limit reached")).toBeTruthy();
  });

  it("keeps unlimited tracks without implying a percentage", () => {
    render(
      <OrganizationPlanUsage
        status={{
          ...status,
          usage: { ...status.usage, maxResources: UNLIMITED, maxMembers: UNLIMITED },
        }}
      />,
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(
      screen.getByRole("progressbar", { name: "Resources" }).hasAttribute("aria-valuenow"),
    ).toBe(false);
    expect(
      screen.getByRole("progressbar", { name: "Resources" }).getAttribute("aria-valuetext"),
    ).toBe("12 of Unlimited used");
    expect(screen.getByText("12 of Unlimited used")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("opens storage details on click while counting reservations", async () => {
    render(
      <OrganizationPlanUsage
        status={{
          ...status,
          storage: {
            committedBytes: 60_000_000,
            reservedBytes: 20_000_000,
            maxStorageBytes: 250_000_000,
            maxFileBytes: 25_000_000,
            verifiedAt: null,
            enforcementEnabled: true,
          },
        }}
      />,
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    const storage = screen.getByRole("progressbar", { name: "Storage" });
    expect(storage.getAttribute("aria-valuenow")).toBe("80000000");
    expect(screen.getByText("60 MB of 250 MB used")).toBeTruthy();
    expect(screen.queryByText("20 MB reserved for uploads · 25 MB maximum per file")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Storage" }));
    expect(await screen.findByRole("tooltip")).toHaveProperty(
      "textContent",
      "20 MB reserved for uploads · 25 MB maximum per file",
    );
  });

  it("preserves over-limit counts while clamping the progress bar", () => {
    render(
      <OrganizationPlanUsage
        status={{ ...status, usage: { ...status.usage, resourceCount: 30 } }}
      />,
    );
    const progress = screen.getByRole("progressbar", { name: "Resources" });
    expect(progress.getAttribute("aria-valuenow")).toBe("25");
    expect(progress.getAttribute("aria-valuetext")).toBe("30 of 25 used");
    expect(screen.getByText("Over plan limit")).toBeTruthy();
  });

  it("exposes cached usage details to keyboard users", async () => {
    render(
      <OrganizationPlanUsage
        status={{
          ...status,
          freshness: "cached",
          isOnline: false,
          usage: { resourceCount: 12, maxResources: 25, maxMembers: 3 },
        }}
      />,
    );
    expect(screen.getByRole("progressbar", { name: "Members" }).hasAttribute("aria-valuenow")).toBe(
      false,
    );
    expect(screen.getAllByText("Usage unavailable")).toHaveLength(2);
    expect(screen.queryByText(en.organization.billing.usageCached)).toBeNull();
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveProperty(
      "textContent",
      en.organization.billing.usageCached,
    );
  });
});
