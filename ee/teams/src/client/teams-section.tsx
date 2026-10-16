import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
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
import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@lunarisapp/ui/components/dialog";
import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import {
  ArrowRight01Icon,
  HugeiconsIcon,
  PlusSignIcon,
  Search01Icon,
  UserGroupIcon,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import {
  type OrganizationMember,
  useOrganizationMembersQuery,
} from "@repo/data/features/organizations";
import {
  type OrganizationTeam,
  useOrganizationTeamMembershipsQuery,
  useOrganizationTeamsQuery,
} from "./queries";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useAuth, UserAvatar } from "@repo/features/auth";
import { usePermission } from "@repo/features/permissions";
import { useOnlineStatus } from "@repo/platform";
import posthog from "posthog-js";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function membershipKey(teamId: string, userId: string) {
  return `${teamId}:${userId}`;
}

function TeamsLoading({ canCreate }: { canCreate: boolean }) {
  const { t } = useTranslation();

  return (
    <div aria-live="polite" role="status">
      <span className="sr-only">{t("common.loading")}</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          {!!canCreate && <Skeleton className="h-8 w-full sm:w-28" />}
        </div>
        <div className="divide-y border-y">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="py-4"
              // biome-ignore lint/suspicious/noArrayIndexKey: Fixed placeholders or stateless rows; position is the intended identity.
              key={index}
            >
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="size-4" />
              </div>
              <Skeleton className="mt-2 h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamDetails({
  canAdd,
  canDelete,
  canInspect,
  canRemove,
  canUpdate,
  deleting,
  members,
  memberships,
  mutatingMembership,
  online,
  onDelete,
  onMembershipChange,
  onRename,
  team,
  teamCount,
  updating,
}: {
  canAdd: boolean;
  canDelete: boolean;
  canInspect: boolean;
  canRemove: boolean;
  canUpdate: boolean;
  deleting: boolean;
  members: OrganizationMember[];
  memberships: Set<string>;
  mutatingMembership: string | null;
  online: boolean;
  onDelete: (team: OrganizationTeam) => void;
  onMembershipChange: (
    team: OrganizationTeam,
    member: OrganizationMember,
    checked: boolean
  ) => void;
  onRename: (team: OrganizationTeam, name: string) => Promise<boolean>;
  team: OrganizationTeam;
  teamCount: number;
  updating: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(team.name);
  const [search, setSearch] = useState("");
  const assignedMembers = members.filter((member) =>
    memberships.has(membershipKey(team.id, member.user.id))
  );
  const availableMembers = members.filter(
    (member) => !memberships.has(membershipKey(team.id, member.user.id))
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const searchResults = normalizedSearch
    ? availableMembers.filter((member) =>
        `${member.user.name} ${member.user.email}`
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      )
    : [];

  const submitRename = async () => {
    const renamed = await onRename(team, editingName);
    if (renamed) {
      setEditing(false);
    }
  };

  return (
    <>
      <DialogHeader className="border-b p-5 pr-12 sm:p-6 sm:pr-14">
        <DialogTitle className="min-w-0 break-words text-lg leading-snug">
          {team.name}
        </DialogTitle>
        <DialogDescription>
          {t("organization.teams.members")}:{" "}
          <span className="tabular-nums">
            {assignedMembers.length}/{members.length}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 space-y-6 overflow-y-auto overscroll-contain p-5 sm:p-6">
        {!!(canInspect && canAdd) && (
          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="font-medium">
                {t("organization.teams.addMembers")}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t("organization.teams.addMembersDescription")}
              </p>
            </div>
            <div className="relative">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                strokeWidth={2}
              />
              <Input
                aria-label={t("organization.teams.searchMembers")}
                className="pl-8"
                disabled={!online || mutatingMembership !== null}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("organization.teams.searchMembers")}
                type="search"
                value={search}
              />
            </div>

            {availableMembers.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
                {t("organization.teams.allMembersAdded")}
              </p>
            )}
            {normalizedSearch &&
              searchResults.length === 0 &&
              availableMembers.length > 0 && (
                <p
                  aria-live="polite"
                  className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm"
                  role="status"
                >
                  {t("organization.teams.noMemberResults")}
                </p>
              )}
            {searchResults.length > 0 && (
              <div
                className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-1"
                role="list"
              >
                {searchResults.map((member) => {
                  const key = membershipKey(team.id, member.user.id);
                  const adding = mutatingMembership === key;

                  return (
                    <div
                      className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2"
                      key={member.id}
                      role="listitem"
                    >
                      <UserAvatar size="sm" user={member.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {member.user.name}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {member.user.email}
                        </p>
                      </div>
                      <Button
                        aria-label={t("organization.teams.addMember", {
                          member: member.user.name,
                          team: team.name,
                        })}
                        disabled={!online || mutatingMembership !== null}
                        onClick={() => onMembershipChange(team, member, true)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {adding && (
                          <Spinner aria-hidden="true" role="presentation" />
                        )}
                        {t("organization.teams.add")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!!canInspect && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">{t("organization.teams.members")}</h3>
              <span
                aria-live="polite"
                className="text-muted-foreground text-xs tabular-nums"
              >
                {assignedMembers.length}
              </span>
            </div>
            {assignedMembers.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
                {t("organization.noMembers")}
              </p>
            ) : (
              <div className="divide-y rounded-lg border" role="list">
                {assignedMembers.map((member) => {
                  const key = membershipKey(team.id, member.user.id);
                  const removing = mutatingMembership === key;

                  return (
                    <div
                      className="flex min-h-14 items-center gap-3 px-3 py-2"
                      data-testid="organization-team-member"
                      key={member.id}
                      role="listitem"
                    >
                      <UserAvatar size="sm" user={member.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {member.user.name}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {member.user.email}
                        </p>
                      </div>
                      {!!canRemove && (
                        <Button
                          aria-label={t("organization.teams.removeMember", {
                            member: member.user.name,
                            team: team.name,
                          })}
                          disabled={!online || mutatingMembership !== null}
                          onClick={() =>
                            onMembershipChange(team, member, false)
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {removing && (
                            <Spinner aria-hidden="true" role="presentation" />
                          )}
                          {t("common.remove")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!!(canUpdate || canDelete) && (
          <section className="space-y-3 border-t pt-5">
            {editing ? (
              <form
                aria-busy={updating}
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitRename();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="organization-team-edit-name">
                    {t("organization.teams.name")}
                  </Label>
                  <Input
                    autoFocus
                    disabled={!online || updating}
                    id="organization-team-edit-name"
                    maxLength={100}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setEditing(false);
                      }
                    }}
                    pattern=".*\S.*"
                    required
                    title={t("organization.nameRequired")}
                    value={editingName}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={
                      !online || editingName.trim() === team.name || updating
                    }
                    size="sm"
                    type="submit"
                  >
                    {!!updating && (
                      <Spinner aria-hidden="true" role="presentation" />
                    )}
                    {t("common.save")}
                  </Button>
                  <Button
                    disabled={updating}
                    onClick={() => {
                      setEditing(false);
                      setEditingName(team.name);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!!canUpdate && (
                  <Button
                    disabled={!online}
                    onClick={() => setEditing(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("organization.teams.rename")}
                  </Button>
                )}
                {!!canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger
                      disabled={!online || teamCount <= 1 || deleting}
                      render={
                        <Button
                          size="sm"
                          title={
                            teamCount <= 1
                              ? t("organization.teams.keepOne")
                              : undefined
                          }
                          variant="outline"
                        />
                      }
                    >
                      {t("organization.teams.delete")}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("organization.teams.deleteConfirmTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("organization.teams.deleteConfirmDescription", {
                            name: team.name,
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("common.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={!online || deleting}
                          onClick={() => onDelete(team)}
                          variant="destructive"
                        >
                          {!!deleting && (
                            <Spinner aria-hidden="true" role="presentation" />
                          )}
                          {t("organization.teams.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

export function TeamsSection() {
  const { t } = useTranslation();
  const auth = useAuth();
  const online = useOnlineStatus();
  const { data: session } = auth.useSession();
  const { data: activeOrgData } = auth.useActiveOrganization();
  const stableOrgRef = useRef(activeOrgData);
  if (activeOrgData) {
    stableOrgRef.current = activeOrgData;
  }
  const activeOrg = stableOrgRef.current;
  const orgId = activeOrg?.id ?? "";

  const canRead = usePermission(permission.team.read);
  const canCreate = usePermission(permission.team.create);
  const canUpdate = usePermission(permission.team.update);
  const canDelete = usePermission(permission.team.delete);
  const canAddMember = usePermission(permission.member.update);
  const canRemoveMember = usePermission(permission.member.delete);
  const canInspectMemberships = canRead;
  const canManageMemberships =
    canInspectMemberships && (canAddMember || canRemoveMember);
  const canManageTeams =
    canCreate || canUpdate || canDelete || canManageMemberships;

  const membersQuery = useOrganizationMembersQuery(orgId);
  const members = membersQuery.data ?? [];
  const teamsQuery = useOrganizationTeamsQuery(orgId);
  const membershipsQuery = useOrganizationTeamMembershipsQuery(orgId);

  const teams = teamsQuery.data ?? [];
  const memberships = new Set(
    (membershipsQuery.data ?? []).map((membership) =>
      membershipKey(membership.teamId, membership.userId)
    )
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mutatingMembership, setMutatingMembership] = useState<string | null>(
    null
  );
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;

  const showRequestError = (error: unknown) => {
    const userFacingError = getUserFacingError(error);
    toast.error(t(userFacingError.titleKey), {
      description: getUserFacingDescription(userFacingError, t),
    });
  };

  const handleCreate = async () => {
    const name = newTeamName.trim();
    if (!(online && canCreate && activeOrg && name) || creating) {
      return;
    }
    setCreating(true);

    try {
      const { data, error } = await auth.organization.createTeam({
        name,
        organizationId: activeOrg.id,
      });
      if (error || !data) {
        showRequestError(error);
        return;
      }

      setNewTeamName("");
      setCreateOpen(false);
      posthog.capture("organization_team_created");
      toast.success(t("organization.teams.created"));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (team: OrganizationTeam, nextName: string) => {
    const name = nextName.trim();
    if (!(online && canUpdate && name) || name === team.name || updatingId) {
      return false;
    }
    setUpdatingId(team.id);

    try {
      const { data, error } = await auth.organization.updateTeam({
        data: { name, organizationId: orgId },
        teamId: team.id,
      });
      if (error || !data) {
        showRequestError(error);
        return false;
      }

      posthog.capture("organization_team_updated");
      toast.success(t("organization.teams.updated"));
      return true;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (team: OrganizationTeam) => {
    if (!(online && canDelete) || teams.length <= 1 || deletingId) {
      return;
    }
    setDeletingId(team.id);

    try {
      if (session?.session.activeTeamId === team.id) {
        const { error } = await auth.organization.setActiveTeam({
          teamId: null,
        });
        if (error) {
          showRequestError(error);
          return;
        }
      }
      const { error } = await auth.organization.removeTeam({
        organizationId: orgId,
        teamId: team.id,
      });
      if (error) {
        showRequestError(error);
        return;
      }

      posthog.capture("organization_team_deleted");
      setSelectedTeamId(null);
      toast.success(t("organization.teams.deleted"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleMembershipChange = async (
    team: OrganizationTeam,
    member: OrganizationMember,
    checked: boolean
  ) => {
    if (
      !online ||
      (checked && !canAddMember) ||
      !(checked || canRemoveMember)
    ) {
      return;
    }
    const key = membershipKey(team.id, member.user.id);
    if (mutatingMembership) {
      return;
    }
    setMutatingMembership(key);

    try {
      const result = checked
        ? await auth.organization.addTeamMember({
            organizationId: orgId,
            teamId: team.id,
            userId: member.user.id,
          })
        : await auth.organization.removeTeamMember({
            organizationId: orgId,
            teamId: team.id,
            userId: member.user.id,
          });
      if (result.error) {
        showRequestError(result.error);
        return;
      }

      posthog.capture(
        checked
          ? "organization_team_member_added"
          : "organization_team_member_removed"
      );
      toast.success(
        t(
          checked
            ? "organization.teams.memberAdded"
            : "organization.teams.memberRemoved"
        )
      );
    } finally {
      setMutatingMembership(null);
    }
  };

  if (membersQuery.error) {
    throw membersQuery.error;
  }
  if (teamsQuery.error) {
    throw teamsQuery.error;
  }
  if (membershipsQuery.error) {
    throw membershipsQuery.error;
  }

  if (
    teamsQuery.isLoading ||
    membershipsQuery.isLoading ||
    membersQuery.isLoading
  ) {
    return <TeamsLoading canCreate={canCreate} />;
  }

  return (
    <div className="space-y-6">
      {!(online && canManageTeams) && (
        <div className="space-y-3">
          {!online && (
            <Alert>
              <AlertTitle>{t("organization.teams.offlineTitle")}</AlertTitle>
              <AlertDescription>
                {t("organization.teams.offlineDescription")}
              </AlertDescription>
            </Alert>
          )}
          {!canManageTeams && (
            <Alert>
              <AlertTitle>{t("permissions.readOnlyTitle")}</AlertTitle>
              <AlertDescription>
                {t("permissions.readOnlyDescription")}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
      <section aria-label={t("organization.teams.tab")} className="space-y-4">
        {canCreate && (
          <div className="flex justify-end">
            <Dialog
              onOpenChange={(open) => {
                if (creating) {
                  return;
                }
                setCreateOpen(open);
                if (!open) {
                  setNewTeamName("");
                }
              }}
              open={createOpen}
            >
              <DialogTrigger
                disabled={!online}
                render={<Button className="w-full sm:w-auto" />}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                {t("organization.teams.createButton")}
              </DialogTrigger>
              <DialogContent>
                <form
                  aria-busy={creating}
                  className="contents"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreate();
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>{t("organization.teams.create")}</DialogTitle>
                    <DialogDescription>
                      {t("organization.teams.description")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="organization-team-name">
                      {t("organization.teams.name")}
                    </Label>
                    <Input
                      autoFocus
                      data-testid="organization-team-name"
                      disabled={!online || creating}
                      id="organization-team-name"
                      maxLength={100}
                      onChange={(event) => setNewTeamName(event.target.value)}
                      pattern=".*\S.*"
                      required
                      title={t("organization.nameRequired")}
                      value={newTeamName}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      data-testid="organization-team-create"
                      disabled={!online || creating}
                      type="submit"
                    >
                      {!!creating && (
                        <Spinner aria-hidden="true" role="presentation" />
                      )}
                      {t("organization.teams.createButton")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
        {teams.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">
              {t("organization.teams.empty")}
            </p>
          </div>
        ) : (
          <div className="divide-y border-y" role="list">
            {teams.map((team) => {
              const assignedCount = members.reduce(
                (count, member) =>
                  count +
                  (memberships.has(membershipKey(team.id, member.user.id))
                    ? 1
                    : 0),
                0
              );
              const memberDescriptionId = `organization-team-${team.id}-members`;

              return (
                <div
                  data-testid="organization-team"
                  key={team.id}
                  role="listitem"
                >
                  <button
                    aria-describedby={memberDescriptionId}
                    aria-label={t("organization.teams.openDetails", {
                      name: team.name,
                    })}
                    className="group flex min-h-20 w-full cursor-pointer items-center gap-4 px-2 py-4 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => setSelectedTeamId(team.id)}
                    type="button"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={UserGroupIcon}
                          strokeWidth={2}
                        />
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-semibold text-sm"
                        title={team.name}
                      >
                        {team.name}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-4">
                      <span
                        className="text-muted-foreground text-sm"
                        id={memberDescriptionId}
                      >
                        <span className="tabular-nums">{assignedCount}</span>{" "}
                        {t("organization.teams.memberLabel", {
                          count: assignedCount,
                        })}
                      </span>
                      <HugeiconsIcon
                        aria-hidden="true"
                        className="size-4 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                      />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog
        onOpenChange={(open) => {
          if (!open && deletingId === null && updatingId === null) {
            setSelectedTeamId(null);
          }
        }}
        open={selectedTeam !== null}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {!!selectedTeam && (
            <TeamDetails
              canAdd={canAddMember}
              canDelete={canDelete}
              canInspect={canInspectMemberships}
              canRemove={canRemoveMember}
              canUpdate={canUpdate}
              deleting={deletingId === selectedTeam.id}
              members={members}
              memberships={memberships}
              mutatingMembership={mutatingMembership}
              onDelete={(team) => void handleDelete(team)}
              onMembershipChange={(team, member, checked) =>
                void handleMembershipChange(team, member, checked)
              }
              onRename={handleUpdate}
              online={online}
              team={selectedTeam}
              teamCount={teams.length}
              updating={updatingId === selectedTeam.id}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
