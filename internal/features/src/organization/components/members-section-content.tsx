import type { ReactNode } from "react";
import type { OrganizationTeamSummary } from "../sections";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@lunarisapp/ui/components/alert-dialog";
import { Badge } from "@lunarisapp/ui/components/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lunarisapp/ui/components/table";
import { UNLIMITED } from "@repo/auth/entitlements";
import type {
  OrganizationMember as Member,
  OrganizationRole,
} from "@repo/data/features/organizations";
import { UserAvatar } from "@repo/features/auth";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Invitation } from "../queries";

export type ManageableRole = Exclude<OrganizationRole, "owner">;

const MANAGEABLE_ROLES = [
  "editor",
  "viewer",
] as const satisfies readonly ManageableRole[];

const ROLE_KEYS: Record<OrganizationRole, string> = {
  editor: "organization.roleEditor",
  owner: "organization.roleOwner",
  viewer: "organization.roleViewer",
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

function isManageableRole(value: unknown): value is ManageableRole {
  return value === "editor" || value === "viewer";
}

interface InviteMemberFormProps {
  capacityReached: boolean;
  inviteRole: ManageableRole;
  inviting: boolean;
  memberLimit: number;
  occupiedCapacity: number;
  onInvite: (email: string) => Promise<boolean>;
  onRoleChange: (role: ManageableRole) => void;
  teamPicker?: ReactNode;
}

export function InviteMemberForm({
  capacityReached,
  inviteRole,
  inviting,
  memberLimit,
  occupiedCapacity,
  onInvite,
  onRoleChange,
  teamPicker,
}: InviteMemberFormProps) {
  const { t } = useTranslation();
  const [inviteEmail, setInviteEmail] = useState("");
  const capacityId = useId();
  const headingId = useId();

  const handleInvite = async () => {
    if (await onInvite(inviteEmail)) {
      setInviteEmail("");
    }
  };

  return (
    <form
      aria-busy={inviting}
      aria-labelledby={headingId}
      className="grid gap-5 border-b pb-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
      onSubmit={(event) => {
        event.preventDefault();
        void handleInvite();
      }}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold" id={headingId}>
          {t("organization.invite")}
        </h2>
        <p className="text-muted-foreground text-sm" id={capacityId}>
          {memberLimit === UNLIMITED
            ? t("organization.memberCapacityUnlimited")
            : capacityReached
              ? t("organization.memberCapacityReached")
              : t("organization.memberCapacity", {
                  count: occupiedCapacity,
                  limit: memberLimit,
                })}
        </p>
      </div>

      <div className="grid max-w-3xl gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_140px_160px_auto]">
        <div className="space-y-2">
          <Label htmlFor="organization-invite-email">
            {t("organization.invitationEmail")}
          </Label>
          <Input
            aria-describedby={capacityId}
            autoComplete="off"
            data-testid="organization-invite-email"
            id="organization-invite-email"
            onChange={(event) => setInviteEmail(event.target.value.trim())}
            placeholder="name@example.com"
            required
            type="email"
            value={inviteEmail}
          />
        </div>

        {teamPicker}

        <div className="space-y-2">
          <Label htmlFor="organization-invite-role">
            {t("organization.invitationRole")}
          </Label>
          <Select
            onValueChange={(value) => {
              if (isManageableRole(value)) onRoleChange(value);
            }}
            value={inviteRole}
          >
            <SelectTrigger
              className="w-full"
              data-testid="organization-invite-role"
              id="organization-invite-role"
            >
              <SelectValue>{t(ROLE_KEYS[inviteRole])}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {MANAGEABLE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(ROLE_KEYS[role])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div
            aria-hidden="true"
            className="text-sm leading-none hidden xl:block"
          >
            &nbsp;
          </div>
          <Button
            className="w-full xl:w-auto"
            data-testid="organization-invite-submit"
            disabled={inviting || capacityReached}
            type="submit"
          >
            {t("organization.sendInvite")}
          </Button>
        </div>
      </div>
    </form>
  );
}

interface PendingInvitationsProps {
  canCancel: boolean;
  cancelingId: string | null;
  canResend: boolean;
  invitations: Invitation[];
  onCancel: (invitationId: string) => void;
  onResend: (invitation: Invitation) => void;
  resendingId: string | null;
  teams: OrganizationTeamSummary[];
}

export function PendingInvitations({
  canCancel,
  canResend,
  cancelingId,
  invitations,
  onCancel,
  onResend,
  resendingId,
  teams,
}: PendingInvitationsProps) {
  const { t } = useTranslation();
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-5 border-b pb-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
    >
      <h2 className="text-base font-semibold" id={headingId}>
        {t("organization.pendingInvitations")}
      </h2>

      <div className="min-w-0 max-w-3xl">
        {invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("organization.noPendingInvitations")}
          </p>
        ) : (
          <div className="divide-y border-y" role="list">
          {invitations.map((invitation) => (
            <div
              className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between"
              data-testid={`organization-invitation-${invitation.id}`}
              key={invitation.id}
              role="listitem"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">
                  {invitation.email}
                </p>
                <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>
                    {t("organization.invitationRole")}:{" "}
                    {t(ROLE_KEYS[invitation.role])}
                  </span>
                  {invitation.teamId && (
                    <span>
                      {t("organization.invitationTeam")}: {invitation.teamId
                        .split(",")
                        .map(
                          (teamId) =>
                            teams.find((team) => team.id === teamId)?.name ??
                            teamId,
                        )
                        .join(", ")}
                    </span>
                  )}
                  <span>
                    {t("organization.invitedOn")}:{" "}
                    {DATE_FORMATTER.format(new Date(invitation.createdAt))}
                  </span>
                  <span>
                    {t("organization.expiresOn")}:{" "}
                    {DATE_FORMATTER.format(new Date(invitation.expiresAt))}
                  </span>
                </div>
              </div>

              {(canCancel || canResend) && <div className="flex flex-wrap gap-2">
                {canResend && <Button
                  aria-label={`${t("organization.resendInvitation")}: ${invitation.email}`}
                  disabled={resendingId === invitation.id}
                  onClick={() => onResend(invitation)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("organization.resendInvitation")}
                </Button>}
                {canCancel && <Button
                  aria-label={`${t("organization.cancelInvitation")}: ${invitation.email}`}
                  disabled={cancelingId === invitation.id}
                  onClick={() => onCancel(invitation.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("organization.cancelInvitation")}
                </Button>}
              </div>}
            </div>
          ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface MembersTableProps {
  canRemove: boolean;
  canUpdate: boolean;
  currentUserId: string | undefined;
  members: Member[];
  onRemove: (member: Member) => void;
  onRoleChange: (member: Member, role: ManageableRole) => void;
  removingId: string | null;
}

export function MembersTable({
  canRemove,
  canUpdate,
  currentUserId,
  members,
  onRemove,
  onRoleChange,
  removingId,
}: MembersTableProps) {
  const { t } = useTranslation();
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
    >
      <h2 className="text-base font-semibold" id={headingId}>
        {t("organization.members")}
      </h2>
      <div className="min-w-0 max-w-3xl">
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("organization.noMembers")}
          </p>
        ) : (
          <Table aria-labelledby={headingId}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("organization.memberName")}</TableHead>
              <TableHead scope="col">{t("organization.memberRole")}</TableHead>
              {canRemove && (
                <TableHead className="w-24" scope="col">
                  {t("organization.memberActions")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const canEdit =
                member.role !== "owner" &&
                member.user.id !== currentUserId;
              const canEditRole = canUpdate && canEdit;
              const canRemoveMember = canRemove && canEdit;

              return (
                <TableRow
                  data-member-email={member.user.email}
                  data-testid="organization-member-row"
                  key={member.id}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar size="sm" user={member.user} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.user.name}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {member.user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canEditRole ? (
                      <Select
                        onValueChange={(value) => {
                          if (isManageableRole(value)) {
                            onRoleChange(member, value);
                          }
                        }}
                        value={member.role}
                      >
                        <SelectTrigger
                          aria-label={`${t("organization.memberRole")}: ${member.user.name}, ${t(ROLE_KEYS[member.role])}`}
                          className="w-32"
                        >
                          <SelectValue>
                            {t(ROLE_KEYS[member.role])}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="end">
                          {MANAGEABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(ROLE_KEYS[role])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">
                        {t(ROLE_KEYS[member.role])}
                      </Badge>
                    )}
                  </TableCell>
                  {canRemove && (
                    <TableCell>
                      {canRemoveMember && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            aria-label={`${t("organization.removeMember")}: ${member.user.name}`}
                            render={<Button size="sm" variant="destructive" />}
                          >
                            {t("organization.removeMember")}
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("organization.removeMemberConfirmTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("organization.removeMemberConfirmDescription", {
                                  name: member.user.name,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("common.cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                disabled={removingId === member.id}
                                onClick={() => onRemove(member)}
                                variant="destructive"
                              >
                                {t("organization.removeMember")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
