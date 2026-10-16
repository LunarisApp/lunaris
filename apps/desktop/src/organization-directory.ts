interface ActiveOrganization {
  createdAt?: Date | string;
  id: string;
  logo?: string | null;
  name: string;
  slug: string;
}

interface SyncedOrganization {
  created_at?: string | null;
  id: string;
  logo?: string | null;
  name?: string | null;
  slug?: string | null;
}

export interface OrganizationDirectoryEntry {
  createdAt: string;
  id: string;
  logo: string | null;
  name: string;
  slug: string;
}

function timestamp(value?: Date | string | null) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? new Date(0).toISOString();
}

export function resolveOrganizationDirectory(
  syncedOrganizations: SyncedOrganization[],
  activeOrganization?: ActiveOrganization | null,
  includeActiveFallback = false
): OrganizationDirectoryEntry[] {
  const synced = syncedOrganizations.flatMap((organization) =>
    organization.name && organization.slug
      ? [
          {
            createdAt: timestamp(organization.created_at),
            id: organization.id,
            logo: organization.logo ?? null,
            name: organization.name,
            slug: organization.slug,
          },
        ]
      : []
  );

  if (
    !(includeActiveFallback && activeOrganization) ||
    synced.some((organization) => organization.id === activeOrganization.id)
  ) {
    return synced;
  }

  return [
    ...synced,
    {
      createdAt: timestamp(activeOrganization.createdAt),
      id: activeOrganization.id,
      logo: activeOrganization.logo ?? null,
      name: activeOrganization.name,
      slug: activeOrganization.slug,
    },
  ];
}

export function isOrganizationDirectoryCurrent(status: {
  error?: unknown;
  isFetching: boolean;
  isLoading: boolean;
}) {
  return !(status.error || status.isFetching || status.isLoading);
}
