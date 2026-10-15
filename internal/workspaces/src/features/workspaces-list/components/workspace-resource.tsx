import { latestTimestamp } from "@repo/data/features/activity";
import { InputConfirmationDialog } from "@lunarisapp/ui/blocks/input-confirmation-dialog";
import {
  Avatar,
  AvatarFallback,
} from "@lunarisapp/ui/components/avatar";
import { Badge } from "@lunarisapp/ui/components/badge";
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { usePowerSync } from "@repo/data/core";
import {
  type WorkspaceEntity,
  removeWorkspace,
} from "@repo/data/features/workspaces";
import { useAuth } from "@repo/features/auth/context";
import { useCanDeleteWorkspace } from "@repo/workspaces/permissions";
import { useRegion } from "@repo/features/region";
import { clearRecentFilesForWorkspace } from "../../search/hooks/useRecentFiles";
import {
  formatRelativeTime,
  getInitials,
  parseUTCTimestamp,
} from "@repo/utils";
import posthog from "posthog-js";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { WORKSPACE_SETTINGS_TOOL_ID } from "../../organization-navigation/tool-registry";
import { WorkspaceOptionsMenu } from "./workspace-options-menu";

interface WorkspaceResourceProps {
  onWorkspaceIntent?: (workspace: WorkspaceEntity) => void;
  organizationSlug: string | undefined;
  view?: "grid" | "list";
  workspace: WorkspaceEntity;
}

export function WorkspaceResource({
  onWorkspaceIntent,
  workspace,
  view = "grid",
  organizationSlug,
}: WorkspaceResourceProps) {
  const { t } = useTranslation();
  const { pathWithRegion } = useRegion();
  const navigate = useNavigate();
  const db = usePowerSync();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const hasOrganizationDelete = useCanDeleteWorkspace();
  const isPrivate = workspace.visibility === WORKSPACE_VISIBILITY.private;
  const isOwner = isPrivate && workspace.owner_id === session?.user?.id;
  const canDelete = isPrivate ? isOwner : hasOrganizationDelete;

  const handleDelete = () => {
    if (!canDelete) return;
    posthog.capture("workspace_deleted");
    removeWorkspace({ db, id: workspace.id });
    clearRecentFilesForWorkspace(workspace.id);
    setDeleteDialogOpen(false);
  };

  const activityAt = latestTimestamp(workspace.last_activity_at, workspace.updated_at, workspace.created_at)?.toISOString();
  const updatedAt = activityAt
    ? formatRelativeTime(parseUTCTimestamp(activityAt), undefined, t)
    : null;
  const activateWorkspace = () => onWorkspaceIntent?.(workspace);
  const openSettings = () => {
    activateWorkspace();
    if (!organizationSlug || !workspace.slug) return;
    navigate(
      pathWithRegion(
        `/${organizationSlug}/${workspace.slug}/${WORKSPACE_SETTINGS_TOOL_ID}`,
      ),
    );
  };

  const workspaceName = workspace.name ?? t("common.untitled");
  const workspaceHref = organizationSlug
    ? `/${organizationSlug}/${workspace.slug}`
    : "#";
  const visibilityLabel = t(
    `workspaces.workspaceVisibility.${workspace.visibility}`,
  );
  const visibilityBadge = workspace.visibility !== WORKSPACE_VISIBILITY.shared && (
    <Badge className="max-w-full" variant="outline">
      <span className="truncate">{visibilityLabel}</span>
    </Badge>
  );
  const workspaceAvatar = (
    <Avatar
      aria-hidden="true"
      className="size-9 rounded-lg after:rounded-lg"
    >
      <AvatarFallback className="bg-primary/10 text-primary rounded-lg font-semibold">
        {getInitials(workspaceName)}
      </AvatarFallback>
    </Avatar>
  );

  const options = (
    <div
      className="relative z-10 shrink-0 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      data-testid="workspaces-list-item-options"
    >
      <WorkspaceOptionsMenu
        canDelete={canDelete}
        onDelete={() => setDeleteDialogOpen(true)}
        onSettings={openSettings}
        workspaceName={workspaceName}
      />
    </div>
  );

  return (
    <>
      {view === "grid" ? (
        <article
          className="group bg-card ring-foreground/10 hover:ring-foreground/20 hover:shadow-sm relative flex flex-col rounded-xl ring-1 transition-[box-shadow]"
          role="listitem"
        >
          <Link
            className="focus-visible:ring-ring/50 flex flex-1 flex-col rounded-xl p-4 pr-12 outline-none focus-visible:ring-[3px]"
            data-testid={`workspaces-list-item-${workspace.slug}`}
            onFocus={activateWorkspace}
            onPointerDown={activateWorkspace}
            to={workspaceHref}
          >
            <div className="flex min-w-0 items-center gap-3">
              {workspaceAvatar}
              <div className="min-w-0">
                <div
                  className="truncate text-base font-semibold"
                  data-testid="workspaces-list-item-name"
                >
                  {workspaceName}
                </div>
                <div
                  className="text-muted-foreground mt-0.5 truncate text-xs"
                  data-testid="workspaces-list-item-slug"
                >
                  {workspace.slug}
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-3">
              {visibilityBadge}
              {updatedAt && (
                <span className="text-muted-foreground min-w-0 truncate text-xs">
                  {t("workspaces.updated")}{" "}
                  <time dateTime={activityAt}>
                    {updatedAt}
                  </time>
                </span>
              )}
            </div>
          </Link>
          <div className="absolute top-3 right-3">{options}</div>
        </article>
      ) : (
        <div
          className="group hover:bg-muted/50 grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 transition-colors last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] sm:gap-4 sm:px-4"
          role="listitem"
        >
          <Link
            className="focus-visible:ring-ring/50 min-w-0 rounded-lg outline-none focus-visible:ring-[3px]"
            data-testid={`workspaces-list-item-${workspace.slug}`}
            onFocus={activateWorkspace}
            onPointerDown={activateWorkspace}
            to={workspaceHref}
          >
            <div className="flex min-w-0 items-center gap-3">
              {workspaceAvatar}
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-medium"
                  data-testid="workspaces-list-item-name"
                >
                  {workspaceName}
                </div>
                <div
                  className="text-muted-foreground truncate text-xs"
                  data-testid="workspaces-list-item-slug"
                >
                  {workspace.slug}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2 sm:hidden">
                  {visibilityBadge}
                  {updatedAt && (
                    <time
                      aria-label={`${t("workspaces.updated")} ${updatedAt}`}
                      className="text-muted-foreground min-w-0 truncate text-xs"
                      dateTime={activityAt}
                    >
                      {updatedAt}
                    </time>
                  )}
                </div>
              </div>
            </div>
          </Link>
          <div className="hidden min-w-0 sm:block">
            {visibilityBadge || (
              <span className="text-muted-foreground truncate text-xs">
                {visibilityLabel}
              </span>
            )}
          </div>
          <div className="hidden min-w-0 sm:block">
            {updatedAt && (
              <time
                aria-label={`${t("workspaces.updated")} ${updatedAt}`}
                className="text-muted-foreground block truncate text-xs"
                dateTime={activityAt}
              >
                {updatedAt}
              </time>
            )}
          </div>
          {options}
        </div>
      )}
      {canDelete && (
        <InputConfirmationDialog
          cancelLabel={t("common.cancel")}
          confirmationText={workspace.slug ?? t("common.untitled")}
          confirmLabel={t("common.delete")}
          description={t("workspaces.deleteWorkspaceConfirmation")}
          onConfirm={handleDelete}
          onOpenChange={setDeleteDialogOpen}
          open={deleteDialogOpen}
          title={t("common.areYouSure")}
        />
      )}
    </>
  );
}
