import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import {
  Audit01Icon,
  CreditCardIcon,
  DatabaseBackupIcon,
  Settings01Icon,
  Store01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@lunarisapp/ui/icons";
import { PLAN } from "@repo/auth/entitlements";
import { permission } from "@repo/auth/permissions";
import { useOrganizationMemberRoleQuery } from "@repo/data/features/organizations";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth";
import { useEntitlementStatus } from "@repo/features/entitlements";
import { usePermission } from "@repo/features/permissions";
import { RegionSummary, useRegion } from "@repo/features/region";
import { UserMenu } from "@repo/features/user-menu";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  SettingsLayout,
  type SettingsNavigationItem,
} from "../../settings/settings-layout";
import { useOrganizationSections } from "../sections";
import { BackupsSection } from "../components/backups-section";
import { BillingSection } from "../components/billing-section";
import { DeveloperModeSection } from "../components/developer-mode-section";
import { DangerZoneSection } from "../components/danger-zone-section";
import { MarketplacesSection } from "../components/marketplaces-section";
import { useOrganizationDeveloperMode } from "../use-organization-developer-mode";
import { MembersSection } from "../components/members-section";
import { NameField } from "../components/name-field";
import { SlugField } from "../components/slug-field";
import { readPendingOrganization } from "../pending-organization";
import { preloadOrganizationSettingsData } from "../queries";
import {
  isPersonalOrganization,
  resolveOrganizationSettingsTab,
} from "../utils";

interface OrganizationSettingsPageProps {
  onLogout: () => void;
}

export default function OrganizationSettingsPage({
  onLogout,
}: OrganizationSettingsPageProps) {
  const { t } = useTranslation();
  const api = useApi();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session } = auth.useSession();
  const { data: activeOrg } = auth.useActiveOrganization();
  const entitlementStatus = useEntitlementStatus();
  const { region } = useRegion();

  // Hold last known org so transient null during Better Auth refetches
  // doesn't blank the page. Safe because OrganizationScopeGate already
  // validated the org before this component renders.
  const stableOrgRef = useRef(activeOrg);
  if (activeOrg) {
    stableOrgRef.current = activeOrg;
  }
  const org = stableOrgRef.current;
  const isAnonymous = session?.user?.isAnonymous ?? false;
  const sessionUserId = session?.user?.id;
  const hasSelfServeSubscription =
    entitlementStatus.displayPlan === PLAN.plus ||
    entitlementStatus.displayPlan === PLAN.business;
  const roleQuery = useOrganizationMemberRoleQuery(org?.id, sessionUserId);
  const pendingOrganization = readPendingOrganization();
  const organizationName =
    pendingOrganization &&
    pendingOrganization.id === org?.id &&
    pendingOrganization.name
      ? pendingOrganization.name
      : (org?.name ?? "");
  const organizationSlug =
    pendingOrganization && pendingOrganization.id === org?.id
      ? pendingOrganization.slug
      : (org?.slug ?? "");
  const role =
    roleQuery.data ?? (pendingOrganization?.id === org?.id ? "owner" : null);
  const canUpdateOrganization = usePermission(permission.organization.update);
  const canReadMembers = usePermission(permission.member.read);
  const {
    Teams: TeamsSection,
    AuditLog: AuditLogSection,
    Members = MembersSection,
  } = useOrganizationSections();
  const hasTeamPermission = usePermission(permission.team.read);
  const canReadTeams = Boolean(TeamsSection) && hasTeamPermission;
  const hasAuditPermission = usePermission(permission.audit.read);
  const canReadAudit = Boolean(AuditLogSection) && hasAuditPermission;
  const canReadBilling = usePermission(permission.billing.read);
  const canReadBackups = usePermission(permission.backup.read);
  const canReadInvitations = usePermission(permission.invitation.read);
  const canManageInvitations = role === "owner" && canReadInvitations;

  useEffect(() => {
    if (!org?.id) {
      return;
    }
    void preloadOrganizationSettingsData({
      api,
      auth,
      billing:
        role === "owner" &&
        canReadBilling &&
        !isAnonymous &&
        entitlementStatus.billingManagement === "polar" &&
        hasSelfServeSubscription &&
        sessionUserId
          ? { regionId: region.id, userId: sessionUserId }
          : undefined,
      invitations: canManageInvitations,
      orgId: org?.id,
      queryClient,
    });
  }, [
    auth,
    api,
    canReadBilling,
    canManageInvitations,
    entitlementStatus.billingManagement,
    hasSelfServeSubscription,
    isAnonymous,
    org?.id,
    queryClient,
    region.id,
    role,
    sessionUserId,
  ]);

  const canManageMarketplaces =
    role === "owner" && !isAnonymous && canUpdateOrganization;
  const developerMode = useOrganizationDeveloperMode(
    org?.id,
    canManageMarketplaces
  );
  const marketplacesEnabled =
    canManageMarketplaces && developerMode.data?.enabled === true;

  if (!org?.id) {
    return null;
  }

  const isPersonal = isPersonalOrganization(org);
  const isOwner = role === "owner";
  const requestedTab = searchParams.get("tab");
  const activeTab = resolveOrganizationSettingsTab({
    canReadAudit,
    canReadBackups,
    canReadBilling,
    canReadMembers,
    canReadTeams,
    isAnonymous,
    isOwner,
    isPersonal,
    requestedTab,
    marketplacesEnabled,
  });

  const changeTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "general") {
      next.delete("tab");
    } else {
      next.set("tab", value);
    }
    if (value !== "backups") {
      next.delete("backup");
    }
    setSearchParams(next, { replace: true });
  };

  const navigationItems: SettingsNavigationItem[] = [
    {
      description: organizationName,
      icon: Settings01Icon,
      id: "general",
      isActive: activeTab === "general",
      label: t("organization.general"),
      onSelect: () => changeTab("general"),
      testId: "organization-tab-general",
    },
  ];

  if (!isPersonal && canReadMembers) {
    navigationItems.push({
      description: organizationName,
      icon: UserMultipleIcon,
      id: "members",
      isActive: activeTab === "members",
      label: t("organization.members"),
      onSelect: () => changeTab("members"),
      testId: "organization-tab-members",
    });
  }
  if (!isPersonal && canReadTeams) {
    navigationItems.push({
      description: t("organization.teams.description"),
      icon: UserGroupIcon,
      id: "teams",
      isActive: activeTab === "teams",
      label: t("organization.teams.tab"),
      onSelect: () => changeTab("teams"),
      testId: "organization-tab-teams",
    });
  }
  if (!isAnonymous && canReadBilling) {
    navigationItems.push({
      description: t("organization.billing.description"),
      icon: CreditCardIcon,
      id: "billing",
      isActive: activeTab === "billing",
      label: t("organization.billing.tab"),
      onSelect: () => changeTab("billing"),
      testId: "organization-tab-billing",
    });
  }
  if (isOwner && canReadBackups) {
    navigationItems.push({
      description: organizationName,
      icon: DatabaseBackupIcon,
      id: "backups",
      isActive: activeTab === "backups",
      label: t("organization.backups.tab"),
      onSelect: () => changeTab("backups"),
      testId: "organization-tab-backups",
    });
  }
  if (!isAnonymous && isOwner && canReadAudit) {
    navigationItems.push({
      description: t("organization.audit.description"),
      icon: Audit01Icon,
      id: "audit",
      isActive: activeTab === "audit",
      label: t("organization.audit.tab"),
      onSelect: () => changeTab("audit"),
      testId: "organization-tab-audit",
    });
  }
  const marketplacesPending = canManageMarketplaces && developerMode.isPending;
  if (marketplacesEnabled || marketplacesPending) {
    navigationItems.push({
      description: organizationName,
      icon: Store01Icon,
      id: "marketplaces",
      isPending: marketplacesPending,
      isActive: activeTab === "marketplaces",
      label: t("organization.developer.marketplaces"),
      onSelect: () => changeTab("marketplaces"),
      testId: "organization-tab-marketplaces",
    });
  }
  const activeNavigationItem =
    navigationItems.find((item) => item.isActive) ?? navigationItems[0];

  return (
    <SettingsLayout
      backLabel={t("common.back")}
      backTo={`/${organizationSlug}`}
      contentDescription={activeNavigationItem?.description}
      contentTitle={activeNavigationItem?.label ?? t("organization.general")}
      headerActions={<UserMenu onLogout={onLogout} />}
      items={navigationItems}
      skipToContentLabel={t("common.skipToContent")}
      testId="organization-settings-page"
      title={t("organization.settings")}
    >
      <div className="mx-auto w-full max-w-5xl">
        {activeTab === "general" && (
          <div className="space-y-12">
            {!canUpdateOrganization && (
              <Alert>
                <AlertTitle>{t("permissions.readOnlyTitle")}</AlertTitle>
                <AlertDescription>
                  {t("permissions.readOnlyDescription")}
                </AlertDescription>
              </Alert>
            )}
            <section
              aria-labelledby="organization-general-heading"
              className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
            >
              <h2
                className="font-semibold text-base"
                id="organization-general-heading"
              >
                {t("settings.account.organization")}
              </h2>
              <div className="max-w-3xl space-y-5">
                <NameField
                  key={organizationName}
                  name={organizationName}
                  originalName={organizationName}
                />
                <SlugField key={organizationSlug} slug={organizationSlug} />
              </div>
            </section>
            <RegionSummary variant="plain" />
            {isOwner && !isAnonymous && canUpdateOrganization && (
              <DeveloperModeSection key={org.id} organizationId={org.id} />
            )}
            <DangerZoneSection isOwner={isOwner} organization={org} />
          </div>
        )}

        {activeTab === "marketplaces" && marketplacesEnabled && (
          <MarketplacesSection key={org.id} organizationId={org.id} />
        )}

        {activeTab === "members" && !isPersonal && canReadMembers && (
          <Suspense fallback={null}>
            <Members />
          </Suspense>
        )}

        {activeTab === "teams" &&
          !isPersonal &&
          canReadTeams &&
          TeamsSection && (
            <Suspense fallback={null}>
              <TeamsSection />
            </Suspense>
          )}

        {activeTab === "billing" && !isAnonymous && canReadBilling && (
          <BillingSection isOwner={isOwner} organizationId={org.id} />
        )}

        {activeTab === "backups" && isOwner && canReadBackups && (
          <BackupsSection />
        )}

        {activeTab === "audit" &&
          !isAnonymous &&
          isOwner &&
          canReadAudit &&
          AuditLogSection && (
            <Suspense fallback={null}>
              <AuditLogSection active key={org.id} organizationId={org.id} />
            </Suspense>
          )}
      </div>
    </SettingsLayout>
  );
}
