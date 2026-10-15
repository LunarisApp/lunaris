import { useViews } from "@lunarisapp/plugin-sdk";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import { useWorkspaceResourcesMap } from "@repo/workspaces/workspace-explorer";
import { useEffect, useMemo } from "react";
import { useParams } from "react-router";
import {
  resolveWorkspaceView,
  type ViewResolution,
} from "./workspace-deep-link";

const APP_TITLE = "Lunaris";

function resolveBrowserTitle({
  workspaceName,
  resolution,
}: {
  workspaceName?: string | null;
  resolution?: ViewResolution | null;
}) {
  if (resolution?.kind === "resource" && resolution.title) {
    return resolution.title;
  }

  if (resolution?.kind === "plugin-subview" && resolution.title) {
    return resolution.title;
  }

  if (resolution?.kind === "view" && resolution.title) {
    return resolution.title;
  }

  if (resolution?.kind === "none") {
    return APP_TITLE;
  }

  return workspaceName || APP_TITLE;
}

interface UseWorkspaceBrowserTitleOptions {
  resolution?: ViewResolution | null;
}

export function useWorkspaceBrowserTitle({
  resolution: providedResolution,
}: UseWorkspaceBrowserTitleOptions = {}) {
  const { workspace } = useCurrentWorkspace();
  const resourcesMap = useWorkspaceResourcesMap();
  const views = useViews();
  const { subviewId, subviewPath, viewId, organizationSlug } = useParams<{
    subviewId?: string;
    subviewPath?: string;
    viewId?: string;
    organizationSlug: string;
  }>();

  const resolution = useMemo(() => {
    if (providedResolution) {
      return providedResolution;
    }

    if (!workspace?.slug || !organizationSlug) {
      return null;
    }

    return resolveWorkspaceView({
      resourcesMap,
      organizationSlug,
      workspaceSlug: workspace.slug,
      subviewId: subviewId ?? null,
      subviewPath: subviewPath ?? null,
      viewId: viewId ?? null,
      views,
    });
  }, [
    resourcesMap,
    workspace?.slug,
    providedResolution,
    subviewId,
    subviewPath,
    viewId,
    views,
    organizationSlug,
  ]);

  const title = useMemo(
    () =>
      resolveBrowserTitle({
        workspaceName: workspace?.name,
        resolution,
      }),
    [workspace?.name, resolution]
  );

  useEffect(() => {
    document.title = title;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);

  return title;
}
