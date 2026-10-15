import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import { Appbar } from "@repo/features/appbar";
import { WorkspaceLayout } from "@repo/workspaces/layouts";
import { WorkspaceTreeSkeleton } from "@repo/workspaces/workspace-explorer";
import { Statusbar } from "@repo/workspaces/statusbar";
import type { ComponentType } from "react";

interface WorkspaceDesktopLoadingContentProps {
  label?: string;
}

const GROUP_WIDTHS = ["20%", "80%"] as const;

/** Dockview skeleton panels — use inside an existing WorkspaceLayout. */
export function WorkspaceDesktopLoadingContent({
  label = "Loading workspace",
}: WorkspaceDesktopLoadingContentProps) {
  return (
    <div
      aria-busy="true"
      className="grid-layout-theme h-full w-full"
      data-testid="desktop-workspace-loading-shell"
      role="status"
    >
      <div className="flex h-full w-full gap-[10px]">
        {GROUP_WIDTHS.map((width, index) => (
          <div
            className="min-w-0"
            key={width}
            style={{ flexBasis: width, flexGrow: 0, flexShrink: 1 }}
          >
            <div
              className="dv-groupview dv-groupview-header-top h-full w-full overflow-hidden"
              data-testid="desktop-workspace-loading-group"
            >
              <div
                className={`dv-tabs-and-actions-container ${
                  index === 0 ? "dv-single-tab" : ""
                }`}
              >
                <div className="dv-pre-actions-container" />
                <div className="dv-scrollable">
                  <div className="dv-tabs-container" />
                  <div
                    className="dv-scrollbar dv-scrollbar-horizontal"
                    style={{ left: 0, width: 0 }}
                  />
                </div>
                <div className="dv-left-actions-container" />
                <div className="dv-void-container" />
                <div className="dv-right-actions-container" />
              </div>
              <div className="dv-content-container">
                {index === 0 ? <WorkspaceTreeSkeleton /> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Standalone loading shell with full page layout (appbar + statusbar). */
export function WorkspaceDesktopLoadingShell({
  AppBarLeading = () => null,
  AppBarTrailing = () => null,
}: {
  AppBarLeading?: ComponentType;
  AppBarTrailing?: ComponentType;
} = {}) {
  return (
    <WorkspaceLayout>
      <div className="workspace-editor-layout grid min-h-0 flex-1 grid-rows-[3rem_minmax(0,1fr)] transition-[grid-template-rows] duration-200">
        <Appbar className="row-start-1">
          <Appbar.Leading>
            <AppBarLeading />
          </Appbar.Leading>
          <Appbar.Middle>
            <div className="relative w-[15.6rem] max-w-full">
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="absolute start-full top-1/2 ms-2 size-8 -translate-y-1/2 rounded-md" />
            </div>
          </Appbar.Middle>
          <Appbar.Trailing>
            <AppBarTrailing />
          </Appbar.Trailing>
        </Appbar>
        <div className="row-start-2 flex min-h-0 min-w-0 flex-col">
          <WorkspaceLayout.Content>
            <WorkspaceDesktopLoadingContent />
          </WorkspaceLayout.Content>
          <Statusbar>
            <Statusbar.Leading>
              <Skeleton className="size-7 rounded-md" />
            </Statusbar.Leading>
            <Statusbar.Trailing>
              <Skeleton className="h-3 w-20" />
            </Statusbar.Trailing>
          </Statusbar>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
