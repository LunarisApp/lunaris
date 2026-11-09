import {
  getWorkspacePath,
  getWorkspaceSubviewPath,
} from "./workspace-deep-link";

interface DesktopRouteLocation {
  pathname: string;
  search: string;
}

export function resolvePendingDesktopRoute<T extends DesktopRouteLocation>(
  current: T,
  pathname: string,
  search: string
): T | null {
  if (current.pathname === pathname && current.search === search) {
    return null;
  }
  return { ...current, pathname, search };
}

/**
 * Map the currently-active dockview panel to the URL it should occupy.
 *
 *   routable panel (item or tool)  → /:organizationSlug/:workspaceSlug/:viewId
 *   explorer chrome / no panel    → /:organizationSlug/:workspaceSlug
 */
export function getPathForActiveDesktopPanel(
  organizationSlug: string,
  workspaceSlug: string,
  panel: { params?: Record<string, unknown> } | null | undefined,
  fallbackPanel?: { params?: Record<string, unknown> } | null
): string {
  for (const candidate of [panel, fallbackPanel]) {
    const { routeItemId, routePath, routeSubviewId } = candidate?.params ?? {};
    if (
      typeof routeItemId === "string" &&
      routeItemId.length > 0 &&
      typeof routePath === "string" &&
      routePath.length > 0 &&
      typeof routeSubviewId === "string" &&
      routeSubviewId.length > 0
    ) {
      return getWorkspaceSubviewPath(
        organizationSlug,
        workspaceSlug,
        routeItemId,
        routePath,
        routeSubviewId
      );
    }

    for (const viewId of [
      candidate?.params?.viewId,
      candidate?.params?.routeViewId,
    ]) {
      if (typeof viewId === "string" && viewId.length > 0) {
        return getWorkspacePath(organizationSlug, workspaceSlug, viewId);
      }
    }
  }
  return getWorkspacePath(organizationSlug, workspaceSlug);
}
