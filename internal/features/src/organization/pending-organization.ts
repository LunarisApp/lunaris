const PENDING_ORGANIZATION_KEY = "lunaris_pending_organization";
const PENDING_ORGANIZATION_TTL_MS = 60_000;

export interface PendingOrganization {
  id: string;
  name?: string;
  slug: string;
}

export function markPendingOrganization(organization: PendingOrganization): void {
  sessionStorage.setItem(
    PENDING_ORGANIZATION_KEY,
    JSON.stringify({ ...organization, createdAt: Date.now() }),
  );
}

export function readPendingOrganization(): PendingOrganization | null {
  const stored = sessionStorage.getItem(PENDING_ORGANIZATION_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<PendingOrganization> & {
      createdAt?: number;
    };
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.slug !== "string" ||
      (parsed.name != null && typeof parsed.name !== "string") ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > PENDING_ORGANIZATION_TTL_MS
    ) {
      clearPendingOrganization();
      return null;
    }
    const organization = {
      id: parsed.id,
      name: parsed.name,
      slug: parsed.slug,
    };
    return organization;
  } catch {
    clearPendingOrganization();
    return null;
  }
}

export function clearPendingOrganization(): void {
  sessionStorage.removeItem(PENDING_ORGANIZATION_KEY);
}
