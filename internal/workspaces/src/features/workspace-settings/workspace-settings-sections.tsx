"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import {
  BlockGameIcon,
  Delete02Icon,
  FolderLockedIcon,
  HugeiconsIcon,
  UserGroupIcon,
} from "@lunarisapp/ui/icons";
import {
  WORKSPACE_VISIBILITY,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { WorkspaceSharingSettings } from "./workspace-sharing-settings";

const CLOUD_VISIBILITY_OPTIONS = [
  { icon: UserGroupIcon, value: WORKSPACE_VISIBILITY.shared },
  { icon: FolderLockedIcon, value: WORKSPACE_VISIBILITY.private },
] as const;

function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="border-border space-y-5 border-t py-6">
      <div className="space-y-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

interface WorkspaceNameSettingsProps {
  canEdit: boolean;
  canSave: boolean;
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}

export function WorkspaceNameSettings({
  canEdit,
  canSave,
  name,
  onNameChange,
  onSubmit,
  saving,
}: WorkspaceNameSettingsProps) {
  const { t } = useTranslation();

  return (
    <SettingsSection
      description={t("workspaces.generalSettingsDescription")}
      title={t("workspaces.generalSettings")}
    >
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={onSubmit}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="workspace-settings-name">
            {t("workspaces.workspaceName")}
          </Label>
          <Input
            autoComplete="off"
            data-testid="workspace-settings-name"
            disabled={!canEdit || saving}
            id="workspace-settings-name"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onNameChange(event.target.value)
            }
            value={name}
          />
        </div>
        <Button
          data-testid="workspace-settings-save-name"
          disabled={!canSave || saving}
          type="submit"
        >
          {t("common.save")}
        </Button>
      </form>
    </SettingsSection>
  );
}

interface WorkspaceVisibilitySettingsProps {
  canUpdate: boolean;
  isLocal: boolean;
  isPrivateOwner: boolean;
  onVisibilityChange: (visibility: string | null) => void;
  organizationId: string;
  ownerId: string;
  saving: boolean;
  visibility: WorkspaceVisibility;
  workspaceId: string;
}

function LocalWorkspaceVisibility() {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3 py-2">
      <HugeiconsIcon
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
        icon={FolderLockedIcon}
      />
      <div>
        <p className="text-sm font-medium">
          {t("workspaces.workspaceVisibility.local")}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("workspaces.localVisibilityReadOnly")}
        </p>
      </div>
    </div>
  );
}

function CloudWorkspaceVisibilitySelect({
  disabled,
  onValueChange,
  visibility,
}: {
  disabled: boolean;
  onValueChange: (visibility: string | null) => void;
  visibility: WorkspaceVisibility;
}) {
  const { t } = useTranslation();

  return (
    <Select
      disabled={disabled}
      onValueChange={onValueChange}
      value={visibility}
    >
      <SelectTrigger
        className="w-full"
        data-testid="workspace-settings-visibility"
      >
        <SelectValue>
          {(value: string | null) => {
            const option = CLOUD_VISIBILITY_OPTIONS.find(
              (candidate) => candidate.value === value,
            );
            return option ? (
              <span className="flex items-center gap-2">
                <HugeiconsIcon className="size-4" icon={option.icon} />
                {t(`workspaces.workspaceVisibility.${option.value}`)}
              </span>
            ) : null;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CLOUD_VISIBILITY_OPTIONS.map((option) => (
          <SelectItem className="py-2" key={option.value} value={option.value}>
            <HugeiconsIcon
              className="mt-0.5 size-4 shrink-0"
              icon={option.icon}
            />
            <span className="flex flex-col">
              <span>{t(`workspaces.workspaceVisibility.${option.value}`)}</span>
              <span className="text-muted-foreground text-xs font-normal">
                {t(`workspaces.workspaceVisibility.${option.value}.description`)}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function WorkspaceVisibilitySettings({
  canUpdate,
  isLocal,
  isPrivateOwner,
  onVisibilityChange,
  organizationId,
  ownerId,
  workspaceId,
  saving,
  visibility,
}: WorkspaceVisibilitySettingsProps) {
  const { t } = useTranslation();

  return (
    <SettingsSection
      description={t("workspaces.workspaceVisibilityDescription")}
      title={t("workspaces.workspaceVisibility")}
    >
      {isLocal ? (
        <LocalWorkspaceVisibility />
      ) : (
        <CloudWorkspaceVisibilitySelect
          disabled={!canUpdate || saving}
          onValueChange={onVisibilityChange}
          visibility={visibility}
        />
      )}

      {visibility === WORKSPACE_VISIBILITY.private && isPrivateOwner && (
        <div className="border-t pt-4">
          <WorkspaceSharingSettings
            organizationId={organizationId}
            ownerId={ownerId}
            workspaceId={workspaceId}
          />
        </div>
      )}
    </SettingsSection>
  );
}

export function WorkspaceExtensionsSettings({
  onManage,
}: {
  onManage: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SettingsSection
      description={t("workspaces.extensionsSettingsDescription")}
      title={t("commands.extensions")}
    >
      <Button onClick={onManage} variant="outline">
        <HugeiconsIcon icon={BlockGameIcon} />
        {t("workspaces.manageExtensions")}
      </Button>
    </SettingsSection>
  );
}

export function WorkspaceDangerZone({
  canDelete,
  onDelete,
}: {
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="border-border space-y-5 border-t py-6">
      <div className="space-y-1">
        <h2 className="text-destructive font-semibold">
          {t("workspaces.dangerZone")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("workspaces.deleteWorkspaceConfirmation")}
        </p>
      </div>
      <Button
        data-testid="workspace-settings-delete"
        disabled={!canDelete}
        onClick={onDelete}
        variant="destructive"
      >
        <HugeiconsIcon icon={Delete02Icon} />
        {t("workspaces.deleteWorkspace")}
      </Button>
    </section>
  );
}
