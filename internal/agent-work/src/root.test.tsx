// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentWorkRoot } from "./root";

const { access, platform } = vi.hoisted(() => ({
  access: { allowed: false, pending: false },
  platform: { kind: "desktop" },
}));
vi.mock("@repo/features/entitlements", () => ({
  useFeatureAccess: (flag: string) => {
    expect(flag).toBe("agent-work");
    return access;
  },
}));
vi.mock("@repo/features/auth", () => ({
  useAuth: () => ({
    useSession: () => ({ data: { user: { id: "user" }, session: { activeOrganizationId: "org" } } }),
  }),
}));
vi.mock("@repo/features/api", () => ({
  useApi: () => ({ baseUrl: "http://localhost" }),
}));
vi.mock("./view", () => ({
  AgentWorkView: ({ variant }: { variant: string }) => <div>{variant}</div>,
}));

vi.mock("@repo/platform", () => ({ usePlatform: () => platform }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => { cleanup(); platform.kind = "desktop"; });

it.each([
  { allowed: false, pending: false },
  { allowed: true, pending: true },
])("blocks both presentations while access is $allowed, pending $pending", (state) => {
  Object.assign(access, state);
  const { container } = render(<>
    <AgentWorkRoot variant="panel" />
    <AgentWorkRoot variant="workbench" AppBarLeading={() => null} AppBarTrailing={() => null} />
  </>);
  expect(container.textContent).toBe("");
});

it("enables both presentations with the same flag", () => {
  Object.assign(access, { allowed: true, pending: false });
  const view = render(<AgentWorkRoot variant="panel" />);
  expect(screen.getByText("panel")).toBeTruthy();
  view.rerender(<AgentWorkRoot variant="workbench" AppBarLeading={() => null} AppBarTrailing={() => null} />);
  expect(screen.getByText("workbench")).toBeTruthy();
  access.allowed = false;
  view.rerender(<AgentWorkRoot variant="panel" />);
  expect(view.container.textContent).toBe("");
});

it.each(["panel", "workbench"] as const)("blocks agent UI on web for %s", (variant) => {
  Object.assign(access, { allowed: true, pending: false });
  platform.kind = "web";
  render(<AgentWorkRoot variant={variant} AppBarLeading={() => <span>Navigation</span>} AppBarTrailing={() => <span>Account</span>} />);
  expect(screen.getByRole("heading", { name: "agentWork.desktopOnlyTitle" })).toBeTruthy();
  expect(screen.getByText("agentWork.desktopOnly")).toBeTruthy();
  expect(screen.queryByText(variant)).toBeNull();
  if (variant === "workbench") {
    expect(screen.getByText("Navigation")).toBeTruthy();
    expect(screen.getByText("Account")).toBeTruthy();
  }
});
