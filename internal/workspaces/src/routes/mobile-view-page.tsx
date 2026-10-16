import { AgentWorkPanel } from "../features/agent-work/panel";
import { AGENT_WORK_TOOL_ID } from "../features/agent-work/constants";
import { GridLayoutPanel } from "../features/grid-layout/panel";
import { useResourceTypes, useViews } from "@lunarisapp/plugin-sdk";
import { Button } from "@lunarisapp/ui/components/button";
import { MobileHeader } from "@repo/features/mobile";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import { useWorkspaceResourcesMap } from "@repo/workspaces/workspace-explorer";
import SyncStatusIndicator from "@repo/features/sync-status";
import { MobileUserMenu } from "@repo/features/user-menu";
import type { ReactNode } from "react";
import { createElement, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { AppUpdateButton } from "@repo/features/app-update";
import { useLogout } from "@repo/features/auth/use-logout";
import { useWorkspaceBrowserTitle } from "./workspace-browser-title";
import {
  getWorkspacePath,
  resolveWorkspaceView,
  type ViewResolution,
} from "./workspace-deep-link";
import { useMobileViewRegistry } from "./workspace-mobile-shell";

export default function MobileViewPage() {
  const { t } = useTranslation();
  const handleLogout = useLogout();
  const { workspace } = useCurrentWorkspace();
  const { subviewId, subviewPath, viewId, organizationSlug } = useParams<{
    subviewId?: string;
    subviewPath?: string;
    viewId: string;
    organizationSlug: string;
  }>();
  const resourcesMap = useWorkspaceResourcesMap();
  const registry = useMobileViewRegistry();
  const resources = useResourceTypes();
  const views = useViews();
  const navigate = useNavigate();
  const workspaceSlug = workspace?.slug;

  const resolution: ViewResolution = useMemo(
    () =>
      workspaceSlug && organizationSlug
        ? resolveWorkspaceView({
            resourcesMap,
            organizationSlug,
            workspaceSlug,
            subviewId: subviewId ?? null,
            subviewPath: subviewPath ?? null,
            viewId: viewId ?? null,
            views,
          })
        : { kind: "none" },
    [
      resourcesMap,
      organizationSlug,
      workspaceSlug,
      subviewId,
      subviewPath,
      viewId,
      views,
    ]
  );
  useWorkspaceBrowserTitle({ resolution });

  // Redirects + folder focus must run in an effect, not during render.
  useEffect(() => {
    if (!(workspaceSlug && organizationSlug)) {
      return;
    }
    if (resolution.kind === "redirect") {
      navigate(resolution.to, { replace: true });
    } else if (resolution.kind === "folder") {
      navigate(getWorkspacePath(organizationSlug, workspaceSlug), {
        replace: true,
      });
    }
  }, [navigate, organizationSlug, workspaceSlug, resolution]);

  // Workspace still loading — render nothing rather than a spurious not-found
  // flash. A later render (once useCurrentWorkspace resolves) will show the
  // correct view.
  if (!(workspaceSlug && organizationSlug)) {
    return null;
  }

  const backTo =
    resolution.kind === "plugin-subview"
      ? getWorkspacePath(organizationSlug, workspaceSlug, resolution.resourceId)
      : getWorkspacePath(organizationSlug, workspaceSlug);
  const headerTrailing = (
    <div className="flex items-center gap-2">
      <SyncStatusIndicator />
      <AppUpdateButton size="xs" />
    </div>
  );

  const renderWithHeader = (title: string, body: ReactNode) => (
    <div className="flex h-dvh flex-col">
      <MobileHeader
        actions={<MobileUserMenu onLogout={handleLogout} />}
        backTo={backTo}
        title={title}
        titleTrailing={headerTrailing}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );

  switch (resolution.kind) {
    case "none":
      return (
        <ViewNotFound
          workspaceSlug={workspaceSlug}
          organizationSlug={organizationSlug}
        />
      );
    case "redirect":
    case "folder":
      // Effect will navigate; render an empty shell while it does.
      return null;
    case "resource": {
      const resourceType = resources.find(
        ({ resourceTypeId }) => resourceTypeId === resolution.resourceTypeId
      );
      const defaultView = views.find(
        ({ definition }) => definition.viewId === resourceType?.defaultViewId
      );
      const builder = registry.getRenderer(
        defaultView?.extensionId ?? resolution.resourceTypeId,
        defaultView?.definition.viewId ??
          resourceType?.defaultViewId ??
          "resource"
      );
      const body = builder ? (
        createElement(builder, {
          params: {
            viewId: resolution.resourceId,
            resourceId: resolution.resourceId,
            parentId: resolution.parentId,
            resourceTypeId: resolution.resourceTypeId,
            schemaVersion: resolution.schemaVersion,
          },
        })
      ) : (
        <ViewNotFound
          workspaceSlug={workspaceSlug}
          organizationSlug={organizationSlug}
        />
      );
      return renderWithHeader(resolution.title, body);
    }
    case "plugin-subview": {
      const builder = registry.getRenderer(
        resolution.resourceTypeId,
        resolution.viewId
      );
      const body = builder ? (
        createElement(builder, {
          params: {
            resourceId: resolution.resourceId,
            resourceTypeId: resolution.resourceTypeId,
            subviewId: resolution.subviewId,
            viewInstanceId: resolution.viewInstanceId,
          },
        })
      ) : (
        <ViewNotFound
          workspaceSlug={workspaceSlug}
          organizationSlug={organizationSlug}
        />
      );
      return renderWithHeader(resolution.title, body);
    }
    case "tool": {
      const { tool } = resolution;
      if (tool.toolId === AGENT_WORK_TOOL_ID) {
        return renderWithHeader(
          t(tool.titleKey),
          <GridLayoutPanel>
            <AgentWorkPanel />
          </GridLayoutPanel>
        );
      }
      const toolBuilder = registry.getRenderer(tool.pluginId, tool.renderer);
      const body = toolBuilder ? (
        createElement(toolBuilder, {
          params: { viewId: tool.toolId, toolId: tool.toolId },
        })
      ) : (
        <ViewNotFound
          workspaceSlug={workspaceSlug}
          organizationSlug={organizationSlug}
        />
      );
      return renderWithHeader(t(tool.titleKey), body);
    }
    case "view": {
      const builder = registry.getRenderer(
        resolution.extensionId,
        resolution.viewId
      );
      const body = builder ? (
        createElement(builder, {
          params: {
            extensionId: resolution.extensionId,
            viewId: resolution.viewId,
            viewInstanceId: resolution.viewInstanceId,
          },
        })
      ) : (
        <ViewNotFound
          workspaceSlug={workspaceSlug}
          organizationSlug={organizationSlug}
        />
      );
      return renderWithHeader(resolution.title, body);
    }
    default: {
      // Exhaustiveness check — TypeScript fails here if a new
      // ViewResolution variant is added without a matching branch.
      const _exhaustive: never = resolution;
      return _exhaustive;
    }
  }
}

function ViewNotFound({
  organizationSlug,
  workspaceSlug,
}: {
  organizationSlug: string;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="font-semibold text-lg">{t("mobile.resourceNotFound")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("mobile.resourceNotFoundDescription")}
      </p>
      <Button
        nativeButton={false}
        render={<Link to={getWorkspacePath(organizationSlug, workspaceSlug)} />}
        variant="outline"
      >
        {t("mobile.backToWorkspace")}
      </Button>
    </div>
  );
}
