import type { RouteObject } from "react-router";
import { loadWorkspacePage } from "./workspace-route-preload";
import type { WorkspaceRouteOptions, WorkspaceShell } from "./types";

function createWorkspaceChildRoutes(shell: WorkspaceShell): RouteObject[] {
  if (shell === "mobile") {
    return [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./mobile-explorer-page")).default,
        }),
      },
      {
        path: ":viewId/:subviewPath/:subviewId",
        lazy: async () => ({
          Component: (await import("./mobile-view-page")).default,
        }),
      },
      {
        path: ":viewId",
        lazy: async () => ({
          Component: (await import("./mobile-view-page")).default,
        }),
      },
    ];
  }

  return [
    { index: true, element: null },
    { path: ":viewId/:subviewPath/:subviewId", element: null },
    { path: ":viewId", element: null },
  ];
}

export function createWorkspaceRoutes({
  AppBarLeading,
  AppBarTrailing,
  buildVersion,
  shell,
}: WorkspaceRouteOptions): RouteObject[] {
  // Capture startup entry only; later navigation to the list must stay there.
  const initialLocationKey = window.history.state?.key ?? "default";
  return [
    {
      lazy: async () => ({
        Component: (await import("./workspace-tool-scope")).default,
      }),
      children: [
        {
          index: true,
          lazy: async () => {
            const [{ default: WorkspacesPage }, { WorkspacesEntry }] =
              await Promise.all([import("./workspaces"), import("./workspaces-entry")]);
            return {
              Component: () => (
                <WorkspacesEntry initialLocationKey={initialLocationKey}>
                  <WorkspacesPage shell={shell} />
                </WorkspacesEntry>
              ),
            };
          },
        },
        {
          path: ":workspaceSlug",
          lazy: async () => {
            const WorkspacePage = await loadWorkspacePage(shell);
            return {
              Component: () => (
                <WorkspacePage
                  AppBarLeading={AppBarLeading}
                  AppBarTrailing={AppBarTrailing}
                  buildVersion={buildVersion}
                  shell={shell}
                />
              ),
            };
          },
          children: createWorkspaceChildRoutes(shell),
        },
      ],
    },
  ];
}

export type { WorkspaceRouteOptions, WorkspaceShell } from "./types";
