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
  const routeItemId =
    panel?.params?.routeItemId ?? fallbackPanel?.params?.routeItemId;
  const routePath =
    panel?.params?.routePath ?? fallbackPanel?.params?.routePath;
  const routeSubviewId =
    panel?.params?.routeSubviewId ?? fallbackPanel?.params?.routeSubviewId;
  if (
    typeof routeItemId === "string" &&
    typeof routePath === "string" &&
    typeof routeSubviewId === "string"
  ) {
    return getWorkspaceSubviewPath(
      organizationSlug,
      workspaceSlug,
      routeItemId,
      routePath,
      routeSubviewId
    );
  }

  const viewId =
    panel?.params?.viewId ??
    panel?.params?.routeViewId ??
    fallbackPanel?.params?.viewId ??
    fallbackPanel?.params?.routeViewId;
  if (typeof viewId === "string" && viewId.length > 0) {
    return getWorkspacePath(organizationSlug, workspaceSlug, viewId);
  }
  return getWorkspacePath(organizationSlug, workspaceSlug);
}
