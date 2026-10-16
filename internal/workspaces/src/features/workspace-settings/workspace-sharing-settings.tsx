"use client";

import { WORKSPACE_ROLE, type WorkspaceRole } from "@repo/auth/sync-access";
import { useOrganizationMembersQuery } from "@repo/data/features/organizations";
import { useApi } from "@repo/features/api";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  WorkspaceAccessGrantForm,
  type WorkspaceMember,
  WorkspaceMemberList,
} from "./workspace-sharing-controls";
import { useWorkspaceSettingsErrorToast } from "./use-workspace-settings-error-toast";

interface WorkspaceSharingSettingsProps {
  organizationId: string;
  ownerId: string;
  workspaceId: string;
}

function workspaceApiPath(workspaceId: string) {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}`;
}

export function WorkspaceSharingSettings({
  organizationId,
  ownerId,
  workspaceId,
}: WorkspaceSharingSettingsProps) {
  const { t } = useTranslation();
  const api = useApi();
  const showError = useWorkspaceSettingsErrorToast();
  const organizationMembers = useOrganizationMembersQuery(organizationId);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<WorkspaceRole>(WORKSPACE_ROLE.viewer);
  const [busy, setBusy] = useState(false);
  const workspacePath = workspaceApiPath(workspaceId);
  const query = useQuery({
    networkMode: "online",
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () =>
      api.get<{ items: WorkspaceMember[] }>(`${workspacePath}/members`),
  });
  const members = query.data?.items ?? [];
  const grantedUserIds = useMemo(
    () => new Set(members.map((item) => item.user.id)),
    [members]
  );
  const candidates = (organizationMembers.data ?? []).filter(
    (item) => item.user.id !== ownerId && !grantedUserIds.has(item.user.id)
  );

  const mutate = async (
    operation: () => Promise<unknown>,
    options: { refetch?: boolean } = {}
  ) => {
    setBusy(true);
    try {
      await operation();
      if (options.refetch !== false) {
        await query.refetch();
      }
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    if (!selectedUserId) {
      return;
    }
    const added = await mutate(() =>
      api.post(`${workspacePath}/members`, {
        body: { role, userId: selectedUserId },
      })
    );
    if (added) {
      setSelectedUserId("");
      posthog.capture("workspace_member_granted", { role });
      toast.success(t("workspaces.accessGranted"));
    }
  };

  const updateMemberRole = (memberId: string, nextRole: WorkspaceRole) => {
    void mutate(async () => {
      await api.patch(
        `${workspacePath}/members/${encodeURIComponent(memberId)}`,
        { body: { role: nextRole } }
      );
      posthog.capture("workspace_member_role_updated", { role: nextRole });
    });
  };

  const removeMember = (memberId: string) => {
    void mutate(async () => {
      await api.delete(
        `${workspacePath}/members/${encodeURIComponent(memberId)}`
      );
      posthog.capture("workspace_member_revoked");
    });
  };

  const transferOwnership = (userId: string) => {
    void mutate(
      async () => {
        await api.post(`${workspacePath}/transfer`, {
          body: { userId },
        });
        posthog.capture("workspace_ownership_transferred");
      },
      { refetch: false }
    );
  };

  return (
    <div className="space-y-4" data-testid="workspace-sharing-settings">
      <WorkspaceAccessGrantForm
        busy={busy}
        candidates={candidates}
        onAdd={() => void addMember()}
        onRoleChange={setRole}
        onUserChange={setSelectedUserId}
        role={role}
        selectedUserId={selectedUserId}
      />
      <WorkspaceMemberList
        busy={busy}
        isLoading={query.isLoading}
        members={members}
        onRemove={removeMember}
        onRoleChange={updateMemberRole}
        onTransfer={transferOwnership}
      />
    </div>
  );
}
