import {
  AiArtIcon,
  BrochureIcon,
  Chatting01Icon,
  type IconSvgObject,
} from "@lunarisapp/ui/icons";
import type { HotkeyId } from "@repo/features/hotkeys";
import { createAgentWorkRoutes } from "@repo/agent-work/routes";
import { createWorkspaceRoutes } from "@repo/workspaces/routes";
import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import type { Shell } from "./types";

export type AppToolId = "agent-work" | "chats" | "workspaces";

export interface AppToolRouteOptions {
  AppBarLeading: ComponentType;
  AppBarTrailing: ComponentType;
  buildVersion: string;
  shell: Shell;
}

export interface AppToolDefinition {
  enabled: boolean;
  hotkeyId: HotkeyId;
  icon: IconSvgObject;
  id: AppToolId;
  labelKey: "editor.agentWork" | "editor.chats" | "editor.workspaces";
  routes?: (options: AppToolRouteOptions) => RouteObject[];
}

export const APP_TOOLS = [
  {
    enabled: true,
    hotkeyId: "open-workspace",
    icon: BrochureIcon,
    id: "workspaces",
    labelKey: "editor.workspaces",
    routes: createWorkspaceRoutes,
  },
  {
    enabled: true,
    hotkeyId: "open-ai-workflows",
    icon: AiArtIcon,
    id: "agent-work",
    labelKey: "editor.agentWork",
    routes: createAgentWorkRoutes,
  },
  {
    enabled: false,
    hotkeyId: "open-team-chats",
    icon: Chatting01Icon,
    id: "chats",
    labelKey: "editor.chats",
  },
] as const satisfies readonly AppToolDefinition[];

export function createEnabledAppToolRoutes(
  options: AppToolRouteOptions
): RouteObject[] {
  return APP_TOOLS.flatMap((tool) =>
    tool.enabled && tool.routes ? tool.routes(options) : []
  );
}
