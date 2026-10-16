import { describe, expect, it, vi } from "vitest";

const { desktopLoad, mobileLoad, workspaceLoad } = vi.hoisted(() => ({
  desktopLoad: vi.fn(),
  mobileLoad: vi.fn(),
  workspaceLoad: vi.fn(),
}));

vi.mock("./workspace", () => {
  workspaceLoad();
  return { default: () => null };
});
vi.mock("./workspace-desktop-shell", () => {
  desktopLoad();
  return { DesktopWorkspaceShell: () => null };
});
vi.mock("./workspace-mobile-shell", () => {
  mobileLoad();
  return { MobileWorkspaceShell: () => null };
});

import {
  loadWorkspacePage,
  preloadWorkspaceRoute,
} from "./workspace-route-preload";

describe("workspace route preload", () => {
  it("loads the workspace route and exact shell concurrently", async () => {
    await preloadWorkspaceRoute("desktop");

    expect(workspaceLoad).toHaveBeenCalledOnce();
    expect(desktopLoad).toHaveBeenCalledOnce();
    expect(mobileLoad).not.toHaveBeenCalled();

    await preloadWorkspaceRoute("mobile");
    expect(mobileLoad).toHaveBeenCalledOnce();
    await expect(loadWorkspacePage("desktop")).resolves.toBeTypeOf("function");
  });
});
