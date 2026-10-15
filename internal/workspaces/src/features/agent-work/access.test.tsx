import { Suspense } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentWorkLauncher } from "./launcher";
import { AgentWorkPanel } from "./panel";

const { access, openTool } = vi.hoisted(() => ({
  access: { allowed: false, pending: false },
  openTool: vi.fn(),
}));
vi.mock("@repo/features/entitlements", () => ({
  useFeatureAccess: () => access,
}));
vi.mock("@repo/workspaces/organization-navigation", () => ({
  useOrganizationNavigation: () => ({ openTool }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: () => "Agent Work" }),
}));
vi.mock("@repo/agent-work/panel", () => ({
  AgentWorkPanel: () => <div>Mini chat</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  { allowed: false, pending: false },
  { allowed: false, pending: true },
  { allowed: true, pending: true },
])("hides launcher and blocks panel when access is $allowed, pending $pending", (state) => {
  Object.assign(access, state);
  const { container } = render(
    <Suspense fallback="Loading">
      <AgentWorkLauncher />
      <AgentWorkPanel />
    </Suspense>,
  );
  expect(container.textContent).toBe("");
  expect(screen.queryByRole("button")).toBeNull();
});

it("opens and renders the mini tool only when enabled", async () => {
  Object.assign(access, { allowed: true, pending: false });
  render(<Suspense fallback="Loading"><AgentWorkLauncher /><AgentWorkPanel /></Suspense>);
  fireEvent.click(await screen.findByRole("button", { name: "Agent Work" }));
  expect(openTool).toHaveBeenCalledWith({
    toolId: "agent-work",
    target: { direction: "right" },
  });
  expect(await screen.findByText("Mini chat")).toBeTruthy();
});
