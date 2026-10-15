import {
  type EntitlementSnapshot,
  entitlementSnapshotSchema,
} from "@repo/auth/entitlements";

const STORAGE_KEY = "lunaris.entitlements.v3";
const STORAGE_VERSION = 3;

interface EntitlementSnapshotStore {
  records: Record<string, unknown>;
  version: typeof STORAGE_VERSION;
}

function snapshotId(regionId: string, userId: string, organizationId: string) {
  return `${regionId}:${userId}:${organizationId}`;
}

function emptyStore(): EntitlementSnapshotStore {
  return { records: {}, version: STORAGE_VERSION };
}

function readStore(): EntitlementSnapshotStore {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyStore();
    }
    const candidate = parsed as Partial<EntitlementSnapshotStore>;
    if (
      candidate.version !== STORAGE_VERSION ||
      !candidate.records ||
      typeof candidate.records !== "object" ||
      Array.isArray(candidate.records)
    ) {
      return emptyStore();
    }
    return { records: candidate.records, version: STORAGE_VERSION };
  } catch {
    return emptyStore();
  }
}

export function readEntitlementSnapshot(
  regionId: string,
  userId: string,
  organizationId: string,
): EntitlementSnapshot | null {
  const record = readStore().records[
    snapshotId(regionId, userId, organizationId)
  ];
  const parsed = entitlementSnapshotSchema.safeParse(record);
  return parsed.success && parsed.data.organizationId === organizationId
    ? parsed.data
    : null;
}

/** Validate current snapshots before using or persisting them. */
export function parseEntitlementSnapshot(record: unknown): EntitlementSnapshot {
  return entitlementSnapshotSchema.parse(record);
}

export function writeEntitlementSnapshot(
  regionId: string,
  userId: string,
  organizationId: string,
  snapshot: EntitlementSnapshot,
): void {
  if (typeof localStorage === "undefined") return;
  const parsed = entitlementSnapshotSchema.safeParse(snapshot);
  if (!parsed.success || parsed.data.organizationId !== organizationId) return;
  const store = readStore();
  store.records[snapshotId(regionId, userId, organizationId)] = parsed.data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function clearEntitlementSnapshots(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
