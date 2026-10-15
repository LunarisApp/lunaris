import slugify from "slugify";

export function slugifyOrganizationName(name: string) {
  return slugify(name, { lower: true, strict: true });
}

export function isPersonalOrganization(
  org: { isPersonal?: boolean } | null | undefined,
): boolean {
  return org?.isPersonal === true;
}

export type OrganizationSettingsTab =
  | "audit"
  | "backups"
  | "billing"
  | "general"
  | "marketplaces"
  | "members"
  | "teams";

export function resolveOrganizationSettingsTab(params: {
  canReadAudit: boolean;
  canReadBackups: boolean;
  canReadBilling: boolean;
  canReadMembers: boolean;
  canReadTeams: boolean;
  isAnonymous: boolean;
  isOwner: boolean;
  isPersonal: boolean;
  requestedTab: string | null;
  marketplacesEnabled?: boolean;
}): OrganizationSettingsTab {
  if (
    params.requestedTab === "marketplaces" &&
    params.marketplacesEnabled &&
    params.isOwner &&
    !params.isAnonymous
  )
    return "marketplaces";
  if (
    params.requestedTab === "audit" &&
    !params.isAnonymous &&
    params.isOwner &&
    params.canReadAudit
  )
    return "audit";
  if (
    params.requestedTab === "teams" &&
    !params.isPersonal &&
    params.canReadTeams
  )
    return "teams";
  if (
    params.requestedTab === "members" &&
    !params.isPersonal &&
    params.canReadMembers
  )
    return "members";
  if (
    params.requestedTab === "billing" &&
    !params.isAnonymous &&
    params.canReadBilling
  )
    return "billing";
  if (
    params.requestedTab === "backups" &&
    params.isOwner &&
    params.canReadBackups
  )
    return "backups";
  return "general";
}
