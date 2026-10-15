"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lunarisapp/ui/components/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
} from "@lunarisapp/ui/components/avatar";
import {
  Add01Icon,
  HugeiconsIcon,
  Setting07Icon,
  UnfoldMoreIcon,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import { usePermission } from "@repo/features/permissions";
import { useOrganizationMemberRoleQuery, useOrganizationsQuery } from "@repo/data/features/organizations";
import { getInitials } from "@repo/utils";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { OrganizationDeletionStatus } from "./organization-deletion-gate";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../auth/context";
import { appendRedirectToPath } from "../../auth/redirect";
import { useRegion } from "../../region";
import { useOrganizationDeveloperMode } from "../use-organization-developer-mode";
import { readPendingOrganization } from "../pending-organization";
import { CreateOrganizationDialog } from "./create-organization-dialog";

function OrganizationInitialAvatar({
  name,
  testId,
}: {
  name: string | null | undefined;
  testId?: string;
}) {
  return (
    <Avatar
      aria-hidden="true"
      className="rounded-md after:rounded-md"
      data-testid={testId}
      size="sm"
    >
      <AvatarFallback className="bg-primary text-primary-foreground rounded-md font-semibold">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function OrganizationSelector({
  excludedOrganizationId,
}: { excludedOrganizationId?: string } = {}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { pathWithRegion } = useRegion();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = auth.useSession();
  const { data: activeOrg } = auth.useActiveOrganization();
  const organizationsQuery = useOrganizationsQuery();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const isAnonymous = session?.user?.isAnonymous === true;
  const roleQuery = useOrganizationMemberRoleQuery(activeOrg?.id, session?.user?.id);
  const canUpdateOrganization = usePermission(permission.organization.update);
  // Warm settings navigation while the organization menu is available.
  useOrganizationDeveloperMode(
    activeOrg?.id,
    roleQuery.data === "owner" && session?.user?.isAnonymous === false && canUpdateOrganization,
  );
  const redirectTo = `${location.pathname}${location.search}${location.hash}`;
  const syncedOrganizations = organizationsQuery.data ?? [];
  const pendingOrganization = readPendingOrganization();
  const activeOrganization =
    activeOrg && pendingOrganization?.id === activeOrg.id
      ? {
          ...activeOrg,
          name: pendingOrganization.name ?? activeOrg.name,
          slug: pendingOrganization.slug,
        }
      : activeOrg;
  const orgs: Array<{
    id: string;
    name: string | null;
    slug: string | null;
  }> = syncedOrganizations.map((organization) =>
    pendingOrganization?.id === organization.id
      ? {
          ...organization,
          name: pendingOrganization.name ?? organization.name,
          slug: pendingOrganization.slug,
        }
      : organization
  );
  const useActiveFallback =
    isAnonymous ||
    organizationsQuery.isLoading ||
    pendingOrganization?.id === activeOrganization?.id;
  if (
    useActiveFallback &&
    activeOrganization &&
    !orgs.some((organization) => organization.id === activeOrganization.id)
  ) {
    orgs.push(activeOrganization);
  }
  if (
    pendingOrganization?.name &&
    !orgs.some((organization) => organization.id === pendingOrganization.id)
  ) {
    orgs.push(pendingOrganization as {
      id: string;
      name: string;
      slug: string;
    });
  }

  const deletionStatuses = useQueries({
    queries: orgs.map((org) => ({
      queryKey: ["organization-deletion", org.id],
      enabled: false,
    })),
  });
  const hiddenIds = new Set(
    syncedOrganizations
      .filter((org) => org.deletion_requested_at || org.deletion_purge_after)
      .map((org) => org.id),
  );
  deletionStatuses.forEach((query, index) => {
    const status = query.data as OrganizationDeletionStatus | undefined;
    if (status && status.status !== "active") hiddenIds.add(orgs[index]!.id);
  });
  if (excludedOrganizationId) hiddenIds.add(excludedOrganizationId);
  // Synced state reflects restoration; the auth store may still be cached.
  if (
    activeOrg &&
    !syncedOrganizations.some((org) => org.id === activeOrg.id) &&
    (activeOrg.deletionRequestedAt || activeOrg.deletionPurgeAfter)
  ) hiddenIds.add(activeOrg.id);
  const visibleOrgs = orgs.filter((org) => !hiddenIds.has(org.id));
  const activeIsHidden = Boolean(activeOrganization && hiddenIds.has(activeOrganization.id));

  const handleSwitch = (orgId: string) => {
    if (orgId === activeOrg?.id) return;

    const next = visibleOrgs.find((org) => org.id === orgId);
    if (!next?.slug) return;

    navigate(pathWithRegion(`/${next.slug}`));
  };

  const handleCreateClick = () => {
    if (isAnonymous) {
      navigate(appendRedirectToPath(pathWithRegion("/auth/register"), redirectTo));
      return;
    }
    setCreateDialogOpen(true);
  };

  const handleSettingsClick = () => {
    if (activeOrganization) navigate(`/${activeOrganization.slug}/settings`);
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          className="border-border bg-background hover:bg-muted focus-visible:ring-ring/50 data-popup-open:bg-muted flex h-8 min-w-0 max-w-52 items-center gap-2 rounded-lg border px-1.5 text-sm font-medium outline-none transition-colors active:translate-y-px focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 md:max-w-64"
          data-testid="organization-selector-trigger"
          disabled={!activeOrganization}
        >
          <OrganizationInitialAvatar
            name={activeOrganization?.name}
            testId="organization-selector-avatar"
          />
          <span className="truncate">
            {activeOrganization?.name ?? t("workspaces.switchOrganization")}
          </span>
          <HugeiconsIcon
            className="text-muted-foreground ml-auto size-3.5 shrink-0"
            icon={UnfoldMoreIcon}
            strokeWidth={2}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuRadioGroup
            onValueChange={handleSwitch}
            value={activeOrganization?.id ?? ""}
          >
            {visibleOrgs.map((org) => (
              <DropdownMenuRadioItem
                key={org.id}
                value={org.id}
              >
                <OrganizationInitialAvatar name={org.name} />
                <span className="truncate">{org.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="organization-create-trigger"
            onClick={handleCreateClick}
          >
            <HugeiconsIcon
              className="size-4"
              icon={Add01Icon}
              strokeWidth={2}
            />
            {isAnonymous
              ? t("organization.signUpToCreateOrganizations")
              : t("organization.createOrganization")}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="organization-settings-trigger"
            disabled={!activeOrganization || activeIsHidden}
            onClick={handleSettingsClick}
          >
            <HugeiconsIcon
              className="size-4"
              icon={Setting07Icon}
              strokeWidth={2}
            />
            {t("organization.settings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog
        onOpenChange={setCreateDialogOpen}
        open={createDialogOpen}
      />
    </>
  );
}
