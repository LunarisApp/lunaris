import type { ComponentType } from "react";
import type { WorkspacePageProps, WorkspaceShell } from "./types";

const loadWorkspacePageModule = () => import("./workspace");

function loadWorkspaceShell(shell: WorkspaceShell) {
  return shell === "mobile"
    ? import("./workspace-mobile-shell")
    : import("./workspace-desktop-shell");
}

export async function loadWorkspacePage(
  shell: WorkspaceShell
): Promise<ComponentType<WorkspacePageProps>> {
  const [workspacePage] = await Promise.all([
    loadWorkspacePageModule(),
    loadWorkspaceShell(shell),
  ]);
  return workspacePage.default;
}

export async function preloadWorkspaceRoute(
  shell: WorkspaceShell
): Promise<void> {
  await Promise.all([loadWorkspacePageModule(), loadWorkspaceShell(shell)]);
}
