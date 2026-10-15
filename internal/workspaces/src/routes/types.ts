import type { ComponentType } from "react";

export type WorkspaceShell = "desktop" | "mobile";

export interface WorkspaceRouteOptions {
  AppBarLeading: ComponentType;
  AppBarTrailing: ComponentType;
  buildVersion: string;
  shell: WorkspaceShell;
}

export interface WorkspacePageProps {
  AppBarLeading?: ComponentType;
  AppBarTrailing?: ComponentType;
  buildVersion?: string;
  shell: WorkspaceShell;
}
