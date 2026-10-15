"use client";

import { InputConfirmationDialog } from "@lunarisapp/ui/blocks/input-confirmation-dialog";
import { permission } from "@repo/auth/permissions";
import {
  normalizeWorkspaceVisibility,
  WORKSPACE_VISIBILITY,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";
import { SYNC_ACCESS, usePowerSync, useSyncAccess } from "@repo/data/core";
import {
  removeWorkspace,
  renameWorkspace,
} from "@repo/data/features/workspaces";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth";
import { usePermission } from "@repo/features/permissions";
import { clearRecentFilesForWorkspace } from "@repo/workspaces/search";
import { useCanDeleteWorkspace } from "@repo/workspaces/permissions";
import posthog from "posthog-js";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useCurrentWorkspace } from "../workspace";
import { useRegion } from "@repo/features/region";
import { useOrganizationNavigation } from "../organization-navigation";
import {
  WorkspaceDangerZone,
  WorkspaceExtensionsSettings,
  WorkspaceNameSettings,
  WorkspaceVisibilitySettings,
} from "./workspace-settings-sections";
import { useWorkspaceSettingsErrorToast } from "./use-workspace-settings-error-toast";

export function WorkspaceSettingsPanel() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const api = useApi();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const db = usePowerSync();
  const syncAccess = useSyncAccess();
  const { openTool } = useOrganizationNavigation();
  const navigate = useNavigate();
  const { pathWithRegion } = useRegion();
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const showError = useWorkspaceSettingsErrorToast();
  const hasOrganizationUpdate = usePermission(permission.workspace.update);
  const canDelete = useCanDeleteWorkspace();
  const workspaceVisibility =
    normalizeWorkspaceVisibility(workspace?.visibility) ??
    WORKSPACE_VISIBILITY.shared;
  const [name, setName] = useState(workspace?.name ?? "");
  const [visibility, setVisibility] =
    useState<WorkspaceVisibility>(workspaceVisibility);
  const [savingName, setSavingName] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setName(workspace?.name ?? "");
    setVisibility(workspaceVisibility);
  }, [workspace?.name, workspaceVisibility]);

  if (!workspace) return null;

  const isLocal = workspace.visibility === WORKSPACE_VISIBILITY.local;
  const isPrivateOwner =
    workspace.visibility === WORKSPACE_VISIBILITY.private &&
    workspace.owner_id === session?.user?.id;
  const canUpdate =
    hasOrganizationUpdate &&
    (workspace.visibility !== WORKSPACE_VISIBILITY.private || isPrivateOwner);
  const trimmedName = name.trim();
  const nameChanged = trimmedName !== workspace.name;

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUpdate || !trimmedName || !nameChanged || !workspace.slug) return;
    setSavingName(true);
    try {
      await renameWorkspace({
        db,
        id: workspace.id,
        name: trimmedName,
        slug: workspace.slug,
      });
      posthog.capture("workspace_renamed");
      toast.success(t("workspaces.nameUpdated"));
    } catch (error) {
      showError(error);
    } finally {
      setSavingName(false);
    }
  };

  const updateVisibility = async (nextVisibility: string | null) => {
    if (
      !canUpdate ||
      isLocal ||
      syncAccess !== SYNC_ACCESS.cloud ||
      (nextVisibility !== WORKSPACE_VISIBILITY.shared &&
        nextVisibility !== WORKSPACE_VISIBILITY.private) ||
      nextVisibility === visibility
    ) {
      return;
    }

    const previousVisibility = visibility;
    setVisibility(nextVisibility);
    setSavingVisibility(true);
    try {
      await api.patch(`/v1/workspaces/${encodeURIComponent(workspace.id)}`, {
        body: { visibility: nextVisibility },
      });
      posthog.capture("workspace_visibility_updated", {
        visibility: nextVisibility,
      });
      toast.success(t("workspaces.visibilityUpdated"));
    } catch (error) {
      setVisibility(previousVisibility);
      showError(error);
    } finally {
      setSavingVisibility(false);
    }
  };

  const deleteWorkspace = async () => {
    if (!canDelete) return;
    await removeWorkspace({ db, id: workspace.id });
    clearRecentFilesForWorkspace(workspace.id);
    posthog.capture("workspace_deleted");
    setDeleteDialogOpen(false);
    navigate(pathWithRegion(organizationSlug ? `/${organizationSlug}` : "/"));
  };

  return (
    <div
      className="h-full overflow-y-auto p-4 sm:p-6"
      data-testid="workspace-settings-panel"
    >
      <div className="mx-auto max-w-3xl pb-8">
        <div className="space-y-1 pb-6">
          <h1 className="text-xl font-semibold">
            {t("workspaces.settingsTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("workspaces.settingsDescription")}
          </p>
        </div>

        <WorkspaceNameSettings
          canEdit={canUpdate}
          canSave={canUpdate && Boolean(trimmedName) && nameChanged}
          name={name}
          onNameChange={setName}
          onSubmit={saveName}
          saving={savingName}
        />

        <WorkspaceVisibilitySettings
          canUpdate={canUpdate}
          isLocal={isLocal}
          isPrivateOwner={isPrivateOwner}
          onVisibilityChange={updateVisibility}
          organizationId={workspace.organization_id ?? ""}
          ownerId={workspace.owner_id ?? ""}
          workspaceId={workspace.id}
          saving={savingVisibility}
          visibility={visibility}
        />

        <WorkspaceExtensionsSettings
          onManage={() => openTool({ toolId: "extensions" })}
        />

        <WorkspaceDangerZone
          canDelete={canDelete}
          onDelete={() => setDeleteDialogOpen(true)}
        />
      </div>

      <InputConfirmationDialog
        cancelLabel={t("common.cancel")}
        confirmationText={workspace.slug ?? t("common.untitled")}
        confirmLabel={t("common.delete")}
        description={t("workspaces.deleteWorkspaceConfirmation")}
        onConfirm={() => void deleteWorkspace()}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        title={t("common.areYouSure")}
      />
    </div>
  );
}
