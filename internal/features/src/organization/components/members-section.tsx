import type { ComponentType } from "react";
import type {
  OrganizationTeamSummary,
  InvitationTeamPickerProps,
} from "../sections";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import { Button } from "@lunarisapp/ui/components/button";
import { LIMIT, UNLIMITED } from "@repo/auth/entitlements";
import { permission } from "@repo/auth/permissions";
import {
  type OrganizationMember as Member,
  useOrganizationMembersQuery,
  type OrganizationRole,
} from "@repo/data/features/organizations";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useAuth } from "@repo/features/auth";
import { useLimit } from "@repo/features/entitlements";
import { usePermission } from "@repo/features/permissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { readPendingOrganization } from "../pending-organization";
import {
  type Invitation,
  invitationsQueryOptions,
  organizationQueryKeys,
} from "../queries";
import { isPersonalOrganization } from "../utils";
import {
  InviteMemberForm,
  type ManageableRole,
  MembersTable,
  PendingInvitations,
} from "./members-section-content";

function isPendingInvitation(invitation: Invitation) {
  return (
    invitation.status === "pending" &&
    new Date(invitation.expiresAt).getTime() > Date.now()
  );
}

function byNewest<T extends { createdAt: Date | string }>(items: T[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

interface MembersSectionProps {
  TeamPicker?: ComponentType<InvitationTeamPickerProps>;
  teams?: OrganizationTeamSummary[];
}

export function MembersSection({
  teams: availableTeams = [],
  TeamPicker,
}: MembersSectionProps = {}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { data: session } = auth.useSession();
  const { data: activeOrgData } = auth.useActiveOrganization();
  const stableOrgRef = useRef(activeOrgData);
  if (activeOrgData) {
    stableOrgRef.current = activeOrgData;
  }
  const activeOrg = stableOrgRef.current;
  const orgId = activeOrg?.id ?? "";

  const membersQuery = useOrganizationMembersQuery(orgId);

  const members = membersQuery.data ?? [];
  const currentMember = members.find(
    (member) => member.user.id === session?.user?.id
  );
  const pendingOrganization = readPendingOrganization();
  const roleCanManage =
    currentMember?.role === "owner" ||
    (!currentMember && pendingOrganization?.id === activeOrg?.id);
  const hasInvitationCreatePermission = usePermission(
    permission.invitation.create
  );
  const hasInvitationReadPermission = usePermission(permission.invitation.read);
  const hasInvitationCancelPermission = usePermission(
    permission.invitation.cancel
  );
  const hasMemberUpdatePermission = usePermission(permission.member.update);
  const hasMemberDeletePermission = usePermission(permission.member.delete);
  const hasTeamReadPermission = usePermission(permission.team.read);
  const canCreateInvitation = roleCanManage && hasInvitationCreatePermission;
  const canReadInvitations = roleCanManage && hasInvitationReadPermission;
  const canCancelInvitation = roleCanManage && hasInvitationCancelPermission;
  const canUpdateMember = roleCanManage && hasMemberUpdatePermission;
  const canDeleteMember = roleCanManage && hasMemberDeletePermission;
  const canMutateMembers =
    canCreateInvitation ||
    canCancelInvitation ||
    canUpdateMember ||
    canDeleteMember;

  const invitationsQuery = useQuery({
    ...invitationsQueryOptions(auth, orgId),
    enabled: !!orgId && canReadInvitations,
  });
  const teams = hasTeamReadPermission ? availableTeams : [];
  const invitationsPaused = invitationsQuery.fetchStatus === "paused";
  const invitationsUnavailable = invitationsPaused || invitationsQuery.isError;
  const invitationsLoading =
    invitationsQuery.isPending && invitationsQuery.fetchStatus === "fetching";

  const invitations = byNewest(
    (invitationsQuery.data ?? []).filter(isPendingInvitation)
  );
  const memberLimit = useLimit(LIMIT.maxMembers);
  const occupiedCapacity = members.length + invitations.length;
  const capacityReached =
    memberLimit !== UNLIMITED && occupiedCapacity >= memberLimit;

  const [inviteRole, setInviteRole] = useState<ManageableRole>("viewer");
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);
  const selectedInviteTeamId = teams.some((team) => team.id === inviteTeamId)
    ? inviteTeamId
    : null;
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const showRequestError = (error: unknown) => {
    const userFacingError = getUserFacingError(error);
    toast.error(t(userFacingError.titleKey), {
      description: getUserFacingDescription(userFacingError, t),
    });
  };

  if (isPersonalOrganization(activeOrg)) {
    return (
      <Alert>
        <AlertTitle>
          {t("organization.personalOrganizationNoMembersTitle")}
        </AlertTitle>
        <AlertDescription>
          {t("organization.personalOrganizationNoMembers")}
        </AlertDescription>
      </Alert>
    );
  }

  if (membersQuery.error) {
    throw membersQuery.error;
  }

  const handleInvite = async (inviteEmail: string) => {
    if (!(canCreateInvitation && activeOrg && inviteEmail.trim()) || inviting) {
      return false;
    }

    setInviting(true);

    try {
      const { data, error } = await auth.organization.inviteMember({
        email: inviteEmail.trim(),
        organizationId: activeOrg.id,
        role: inviteRole,
        ...(selectedInviteTeamId ? { teamId: selectedInviteTeamId } : {}),
      });

      if (error || !data) {
        showRequestError(error);
        return false;
      }

      posthog.capture("organization_invite_sent", { role: inviteRole });
      queryClient.setQueryData<Invitation[]>(
        organizationQueryKeys.invitations(orgId),
        (old) => [data as Invitation, ...(old ?? [])]
      );
      toast.success(t("organization.inviteSent"));
      return true;
    } finally {
      setInviting(false);
    }
  };

  const handleResend = async (invitation: Invitation) => {
    if (!(canCreateInvitation && activeOrg) || resendingId) {
      return;
    }

    setResendingId(invitation.id);

    try {
      const { data, error } = await auth.organization.inviteMember({
        email: invitation.email,
        organizationId: activeOrg.id,
        resend: true,
        role: invitation.role,
        ...(invitation.teamId
          ? {
              teamId: invitation.teamId.includes(",")
                ? invitation.teamId.split(",")
                : invitation.teamId,
            }
          : {}),
      });

      if (error || !data) {
        showRequestError(error);
        return;
      }

      posthog.capture("organization_invite_sent", {
        resend: true,
        role: invitation.role,
      });
      queryClient.setQueryData<Invitation[]>(
        organizationQueryKeys.invitations(orgId),
        (old) => [
          data as Invitation,
          ...(old ?? []).filter((item) => item.id !== invitation.id),
        ]
      );
      toast.success(t("organization.inviteResent"));
    } finally {
      setResendingId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!canCancelInvitation || cancelingId) {
      return;
    }

    setCancelingId(invitationId);

    try {
      const { error } = await auth.organization.cancelInvitation({
        invitationId,
      });

      if (error) {
        showRequestError(error);
        return;
      }

      posthog.capture("organization_invite_canceled");
      queryClient.setQueryData<Invitation[]>(
        organizationQueryKeys.invitations(orgId),
        (old) => (old ?? []).filter((item) => item.id !== invitationId)
      );
      toast.success(t("organization.inviteCanceled"));
    } finally {
      setCancelingId(null);
    }
  };

  const handleRoleChange = async (member: Member, role: OrganizationRole) => {
    if (
      !(canUpdateMember && activeOrg) ||
      member.role === role ||
      updatingRoleId
    ) {
      return;
    }

    setUpdatingRoleId(member.id);

    try {
      const { error } = await auth.organization.updateMemberRole({
        memberId: member.id,
        organizationId: activeOrg.id,
        role,
      });

      if (error) {
        showRequestError(error);
        return;
      }

      posthog.capture("organization_member_role_updated", { role });
      toast.success(t("organization.roleUpdated"));
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleRemove = async (member: Member) => {
    if (!canDeleteMember || removingId) {
      return;
    }

    setRemovingId(member.id);

    try {
      const { error } = await auth.organization.removeMember({
        memberIdOrEmail: member.id,
        organizationId: activeOrg?.id,
      });

      if (error) {
        showRequestError(error);
        return;
      }

      posthog.capture("organization_member_removed");
      toast.success(t("organization.memberRemoved"));
    } finally {
      setRemovingId(null);
    }
  };

  if (membersQuery.isLoading) {
    return (
      <div aria-live="polite" role="status">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {!canMutateMembers && (
        <Alert>
          <AlertTitle>{t("permissions.readOnlyTitle")}</AlertTitle>
          <AlertDescription>
            {t("permissions.readOnlyDescription")}
          </AlertDescription>
        </Alert>
      )}
      {!!canCreateInvitation && (
        <InviteMemberForm
          capacityReached={capacityReached}
          inviteRole={inviteRole}
          inviting={inviting}
          memberLimit={memberLimit}
          occupiedCapacity={occupiedCapacity}
          onInvite={handleInvite}
          onRoleChange={setInviteRole}
          teamPicker={
            TeamPicker ? (
              <TeamPicker
                onTeamChange={setInviteTeamId}
                selectedTeamId={selectedInviteTeamId}
                teams={teams}
              />
            ) : undefined
          }
        />
      )}
      {!!canReadInvitations &&
        (invitationsUnavailable ? (
          <Alert variant={invitationsQuery.isError ? "destructive" : "default"}>
            <AlertTitle>
              {t("organization.invitationsUnavailableTitle")}
            </AlertTitle>
            <AlertDescription>
              {t(
                invitationsPaused
                  ? "organization.invitationsOfflineDescription"
                  : "organization.invitationsUnavailableDescription"
              )}
            </AlertDescription>
            {invitationsQuery.isError ? (
              <AlertAction>
                <Button
                  onClick={() => void invitationsQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {t("common.retry")}
                </Button>
              </AlertAction>
            ) : null}
          </Alert>
        ) : invitationsLoading ? (
          <div aria-live="polite" role="status">
            <p className="text-muted-foreground text-sm">
              {t("common.loading")}
            </p>
          </div>
        ) : (
          <PendingInvitations
            canCancel={canCancelInvitation}
            cancelingId={cancelingId}
            canResend={canCreateInvitation}
            invitations={invitations}
            onCancel={handleCancelInvitation}
            onResend={handleResend}
            resendingId={resendingId}
            teams={teams}
          />
        ))}

      <MembersTable
        canRemove={canDeleteMember}
        canUpdate={canUpdateMember}
        currentUserId={session?.user?.id}
        members={members}
        onRemove={handleRemove}
        onRoleChange={handleRoleChange}
        removingId={removingId}
      />
    </div>
  );
}
