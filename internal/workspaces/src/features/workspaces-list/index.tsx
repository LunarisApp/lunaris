import { latestTimestamp } from "@repo/data/features/activity";
import { DelayedLoading } from "@lunarisapp/ui/blocks/delayed-loading";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lunarisapp/ui/components/empty";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import { FolderAddIcon, HugeiconsIcon, Search01Icon } from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import { SYNC_ACCESS, useSyncAccess } from "@repo/data/core";
import {
  type WorkspaceEntity,
  useWorkspacesQuery,
  WORKSPACE_INDEX_SYNC_STREAMS,
} from "@repo/data/features/workspaces";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { WorkspaceResource } from "./components/workspace-resource";

const WorkspacePreloader = lazy(
  () => import("./components/workspace-preloader"),
);

interface WorkspacesListProps {
  createWorkspaceAction?: ReactNode;
  onWorkspaceIntent?: (workspace: WorkspaceEntity) => void;
  organizationId: string | undefined;
  organizationSlug: string | undefined;
  searchQuery?: string;
  sortBy?: WorkspacesSort;
  view?: WorkspacesView;
}

export type WorkspacesSort = "activity" | "name";
export type WorkspacesView = "grid" | "list";

const SKELETON_CARD_COUNT = 6;
const WORKSPACES_INTERACTIVE_MARK = "lunaris:workspaces-interactive";

function markWorkspacesInteractive(marked: { current: boolean }) {
  if (marked.current) return;
  marked.current = true;
  globalThis.performance?.mark(WORKSPACES_INTERACTIVE_MARK);
}

export function WorkspacesList({
  createWorkspaceAction,
  onWorkspaceIntent,
  organizationId,
  searchQuery = "",
  sortBy = "activity",
  view = "grid",
  organizationSlug,
}: WorkspacesListProps) {
  const { t } = useTranslation();
  const syncAccess = useSyncAccess();
  const [, refreshTime] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => refreshTime((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [preloadWorkspace, setPreloadWorkspace] = useState<WorkspaceEntity | null>(
    null,
  );
  const interactionMarked = useRef(false);
  const workspacesQuery = useWorkspacesQuery({
    options:
      syncAccess === SYNC_ACCESS.cloud
        ? { streams: WORKSPACE_INDEX_SYNC_STREAMS }
        : undefined,
    organizationId,
  });
  const data = workspacesQuery.data ?? [];
  const visibleWorkspaces = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const filteredWorkspaces = normalizedQuery
      ? data.filter((workspace) => {
          const name = workspace.name ?? t("common.untitled");
          return [name, workspace.slug].some((value) =>
            value?.toLocaleLowerCase().includes(normalizedQuery),
          );
        })
      : data;

    return [...filteredWorkspaces].sort((left, right) => {
      if (sortBy === "name") {
        const leftName = left.name ?? t("common.untitled");
        const rightName = right.name ?? t("common.untitled");
        return leftName.localeCompare(rightName, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }

      const leftActivity = latestTimestamp(left.last_activity_at, left.updated_at, left.created_at)?.getTime() ?? 0;
      const rightActivity = latestTimestamp(right.last_activity_at, right.updated_at, right.created_at)?.getTime() ?? 0;
      return rightActivity - leftActivity || left.id.localeCompare(right.id);
    });
  }, [data, searchQuery, sortBy, t]);
  const handleWorkspaceIntent = useCallback(
    (workspace: WorkspaceEntity) => {
      onWorkspaceIntent?.(workspace);
      setPreloadWorkspace((current) =>
        current?.id === workspace.id ? current : workspace,
      );
    },
    [onWorkspaceIntent],
  );

  const showSkeleton =
    organizationId === undefined ||
    workspacesQuery.isLoading ||
    (workspacesQuery.isFetching && data.length === 0);
  const showEmpty = data.length === 0;

  useEffect(() => {
    if (!showSkeleton) markWorkspacesInteractive(interactionMarked);
  }, [showSkeleton]);

  if (workspacesQuery.error) {
    markWorkspacesInteractive(interactionMarked);
    throw workspacesQuery.error;
  }

  if (showSkeleton) {
    return (
      <DelayedLoading>
        <div
          aria-busy="true"
          aria-label={t("common.loading")}
          className={cn(
            view === "grid"
              ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              : "ring-foreground/10 overflow-hidden rounded-xl ring-1",
          )}
          data-testid="workspaces-list-skeleton"
          role="status"
        >
          {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
            <div
              className={cn(
                view === "grid"
                  ? "ring-foreground/10 flex flex-col rounded-xl p-4 ring-1"
                  : "grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] sm:gap-4 sm:px-4",
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
              key={index}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              {view === "grid" ? (
                <Skeleton className="mt-3 h-3 w-1/3" />
              ) : (
                <>
                  <Skeleton className="hidden h-5 w-14 sm:block" />
                  <Skeleton className="hidden h-3 w-20 sm:block" />
                  <Skeleton className="size-7" />
                </>
              )}
            </div>
          ))}
        </div>
      </DelayedLoading>
    );
  }

  if (showEmpty) {
    return (
      <>
        <p className="sr-only" role="status">
          {t("workspaces.noWorkspaces")}
        </p>
        <Empty data-testid="workspaces-list-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon aria-hidden="true" icon={FolderAddIcon} />
            </EmptyMedia>
            <EmptyTitle>{t("workspaces.noWorkspaces")}</EmptyTitle>
            <EmptyDescription>
              {t("workspaces.noWorkspacesDescription")}
            </EmptyDescription>
          </EmptyHeader>
          {createWorkspaceAction && (
            <EmptyContent>{createWorkspaceAction}</EmptyContent>
          )}
        </Empty>
      </>
    );
  }

  if (visibleWorkspaces.length === 0) {
    return (
      <Empty data-testid="workspaces-list-no-results" role="status">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon aria-hidden="true" icon={Search01Icon} />
          </EmptyMedia>
          <EmptyTitle>{t("workspaces.noSearchResults")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {preloadWorkspace && (
        <Suspense fallback={null}>
          <WorkspacePreloader
            enabled={syncAccess === SYNC_ACCESS.cloud}
            workspace={preloadWorkspace}
          />
        </Suspense>
      )}
      <p className="sr-only" role="status">
        {t("workspaces.workspaceCount", { count: visibleWorkspaces.length })}
      </p>
      <div
        aria-label={t("workspaces.recentWorkspaces")}
        className={
          view === "grid"
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            : "ring-foreground/10 overflow-hidden rounded-xl ring-1"
        }
        data-testid="workspaces-list"
        data-view={view}
        role="list"
      >
        {view === "list" && (
          <div
            aria-hidden="true"
            className="bg-muted/40 text-muted-foreground hidden grid-cols-[minmax(0,1fr)_7rem_9rem_auto] items-center gap-4 border-b px-4 py-2 text-xs font-medium sm:grid"
          >
            <span>{t("workspaces.workspaceName")}</span>
            <span>{t("workspaces.workspaceVisibility")}</span>
            <span>{t("workspaces.updated")}</span>
            <span className="w-7" />
          </div>
        )}
        {visibleWorkspaces.map((workspace) => (
          <WorkspaceResource
            key={workspace.id}
            onWorkspaceIntent={handleWorkspaceIntent}
            workspace={workspace}
            view={view}
            organizationSlug={organizationSlug}
          />
        ))}
      </div>
    </>
  );
}
