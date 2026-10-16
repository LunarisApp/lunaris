"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { Label } from "@lunarisapp/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import { WORKSPACE_ROLE, type WorkspaceRole } from "@repo/auth/sync-access";
import type { OrganizationMember } from "@repo/data/features/organizations";
import { useTranslation } from "react-i18next";

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  user: OrganizationMember["user"];
  workspaceId: string;
}

interface WorkspaceRoleSelectProps {
  disabled?: boolean;
  onValueChange: (role: WorkspaceRole) => void;
  role: WorkspaceRole;
  testId?: string;
}

function organizationMemberLabel(user: OrganizationMember["user"]) {
  return `${user.name} (${user.email})`;
}

function WorkspaceRoleSelect({
  disabled,
  onValueChange,
  role,
  testId,
}: WorkspaceRoleSelectProps) {
  const { t } = useTranslation();
  const roleLabel = (value: WorkspaceRole) =>
    t(
      value === WORKSPACE_ROLE.editor
        ? "organization.roleEditor"
        : "organization.roleViewer"
    );

  return (
    <Select
      disabled={disabled}
      onValueChange={(value) => {
        if (
          value === WORKSPACE_ROLE.editor ||
          value === WORKSPACE_ROLE.viewer
        ) {
          onValueChange(value);
        }
      }}
      value={role}
    >
      <SelectTrigger className="w-full min-w-0" data-testid={testId}>
        <SelectValue>{roleLabel(role)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={WORKSPACE_ROLE.viewer}>
          {roleLabel(WORKSPACE_ROLE.viewer)}
        </SelectItem>
        <SelectItem value={WORKSPACE_ROLE.editor}>
          {roleLabel(WORKSPACE_ROLE.editor)}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

interface WorkspaceAccessGrantFormProps {
  busy: boolean;
  candidates: OrganizationMember[];
  onAdd: () => void;
  onRoleChange: (role: WorkspaceRole) => void;
  onUserChange: (userId: string) => void;
  role: WorkspaceRole;
  selectedUserId: string;
}

export function WorkspaceAccessGrantForm({
  busy,
  candidates,
  onAdd,
  onRoleChange,
  onUserChange,
  role,
  selectedUserId,
}: WorkspaceAccessGrantFormProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:grid-rows-[auto_auto] md:items-center md:gap-y-2">
      <div className="min-w-0 space-y-2 md:contents md:space-y-0">
        <Label className="md:col-start-1 md:row-start-1">
          {t("workspaces.organizationMember")}
        </Label>
        <Select
          onValueChange={(value) => onUserChange(value ?? "")}
          value={selectedUserId}
        >
          <SelectTrigger
            className="w-full min-w-0 md:col-start-1 md:row-start-2"
            data-testid="workspace-share-user"
          >
            <SelectValue placeholder={t("workspaces.selectMember")}>
              {(value: string | null) => {
                const member = candidates.find(
                  (item) => item.user.id === value
                );
                return member ? organizationMemberLabel(member.user) : null;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {candidates.map((item) => (
              <SelectItem key={item.id} value={item.user.id}>
                {organizationMemberLabel(item.user)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-2 md:contents md:space-y-0">
        <Label className="md:col-start-2 md:row-start-1">
          {t("workspaces.workspaceRole")}
        </Label>
        <div className="md:col-start-2 md:row-start-2">
          <WorkspaceRoleSelect
            onValueChange={onRoleChange}
            role={role}
            testId="workspace-share-role"
          />
        </div>
      </div>
      <Button
        className="w-full md:col-start-3 md:row-start-2 md:w-auto"
        data-testid="workspace-share-add"
        disabled={!selectedUserId || busy}
        onClick={onAdd}
      >
        {t("workspaces.grantAccess")}
      </Button>
    </div>
  );
}

interface WorkspaceMemberListProps {
  busy: boolean;
  isLoading: boolean;
  members: WorkspaceMember[];
  onRemove: (memberId: string) => void;
  onRoleChange: (memberId: string, role: WorkspaceRole) => void;
  onTransfer: (userId: string) => void;
}

export function WorkspaceMemberList({
  busy,
  isLoading,
  members,
  onRemove,
  onRoleChange,
  onTransfer,
}: WorkspaceMemberListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {!!isLoading && (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      )}
      {!isLoading && members.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t("workspaces.noWorkspaceMembers")}
        </p>
      )}
      {members.map((item) => (
        <div
          className="flex flex-col gap-3 border-border border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
          data-testid={`workspace-member-${item.id}`}
          key={item.id}
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{item.user.name}</p>
            <p className="truncate text-muted-foreground text-xs">
              {item.user.email}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="w-32">
              <WorkspaceRoleSelect
                disabled={busy}
                onValueChange={(nextRole) => onRoleChange(item.id, nextRole)}
                role={item.role}
              />
            </div>
            <Button
              disabled={busy}
              onClick={() => onRemove(item.id)}
              size="sm"
              variant="ghost"
            >
              {t("common.remove")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => onTransfer(item.user.id)}
              size="sm"
              variant="outline"
            >
              {t("workspaces.transferOwnership")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
