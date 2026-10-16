"use client";

import {
  type BillingManagement,
  type EntitlementSnapshot,
  type FeatureAccess,
  type FeatureId,
  LIMIT,
  type LimitId,
  PLAN,
  type PlanSlug,
  type ResolvedEntitlements,
  resolveEntitlements,
  resolvePlanFeatures,
  UNLIMITED,
} from "@repo/auth/entitlements";
import { usePowerSync } from "@repo/data/core";
import { getOrganizationWorkspaceResourceUsage } from "@repo/data/features/workspace-resources";
import { onlineManager, useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useApi } from "../api";
import { useAuth } from "../auth/context";
import { useRegion } from "../region";
import {
  parseEntitlementSnapshot,
  readEntitlementSnapshot,
  writeEntitlementSnapshot,
} from "./snapshot";

export type EntitlementFreshness = "live" | "cached" | "expired" | "unverified";

export interface EntitlementStatus {
  billingManagement: BillingManagement;
  displayPlan: PlanSlug;
  freshness: EntitlementFreshness;
  isOnline: boolean;
  storage?: EntitlementSnapshot["storage"] & {
    maxStorageBytes: number;
    maxFileBytes: number;
  };
  usage?: Pick<
    EntitlementSnapshot,
    "resourceCount" | "memberCount" | "pendingInvitationCount"
  > & {
    maxResources: number;
    maxMembers: number;
  };
  verifiedAt: string | null;
}

interface EntitlementsContextValue {
  entitlements: ResolvedEntitlements;
  featureAccess: FeatureAccess;
  featureAccessPending: boolean;
  refresh: () => Promise<void>;
  reserveResourceCapacity: ReserveResourceCapacity;
  status: EntitlementStatus;
}

export interface ResourceCapacityReservation {
  commit: (count?: number) => void;
  rollback: () => void;
}

export type ReserveResourceCapacity = (
  count?: number
) => Promise<ResourceCapacityReservation>;

export interface FeatureAccessResult {
  allowed: boolean;
  pending: boolean;
}

export class ResourceCapacityExceededError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`Organization resource limit of ${limit} reached`);
    this.name = "ResourceCapacityExceededError";
    this.limit = limit;
  }
}

export function isResourceCapacityExceededError(
  error: unknown
): error is ResourceCapacityExceededError {
  return error instanceof ResourceCapacityExceededError;
}

export function getResourceCapacityErrorMessageKey(
  error: unknown,
  fallbackKey: string
): string {
  return isResourceCapacityExceededError(error)
    ? "errors.reason.entitlements.resourceLimit.desc"
    : fallbackKey;
}

interface ResourceCapacityState {
  lastLocalOnlyCount: number;
  lastServerCount: number;
  reservedCount: number;
  usageCount: number;
}

const EMPTY_RESERVATION: ResourceCapacityReservation = {
  commit: () => undefined,
  rollback: () => undefined,
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(
  null
);

interface EntitlementSession {
  user?: {
    id?: string;
    isAnonymous?: boolean;
  } | null;
}

function useOnlineStatus() {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true
  );
}

const MAX_TIMEOUT_MS = 2_147_483_647;

function useExpiryClock(deadline: string | null, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!(enabled && deadline)) {
      return;
    }

    let timer: number | undefined;
    const schedule = () => {
      const remaining = Date.parse(deadline) - Date.now();
      if (remaining <= 0) {
        setNow(Date.now());
        return;
      }
      timer = window.setTimeout(schedule, Math.min(remaining, MAX_TIMEOUT_MS));
    };

    schedule();
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [deadline, enabled]);

  return now;
}

function hydrateEntitlements(
  snapshot: EntitlementSnapshot
): ResolvedEntitlements {
  const limits = { ...snapshot.limits };
  return {
    limit: (limit) => limits[limit] ?? 0,
    limits,
    plan: snapshot.plan,
  };
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const auth = useAuth();
  const db = usePowerSync();
  const { data: session } = auth.useSession() as {
    data: EntitlementSession | null;
  };
  const { data: activeOrganization } = auth.useActiveOrganization();
  const { region } = useRegion();
  const userId = session?.user?.id;
  const organizationId = activeOrganization?.id;
  const isAnonymous = session?.user?.isAnonymous ?? true;
  const isOnline = useOnlineStatus();
  const resourceCapacityByOrganization = useRef(
    new Map<string, ResourceCapacityState>()
  );
  const cachedSnapshot = useMemo(
    () =>
      userId && organizationId
        ? readEntitlementSnapshot(region.id, userId, organizationId)
        : null,
    [region.id, userId, organizationId]
  );

  const snapshotQuery = useQuery({
    enabled: Boolean(userId && organizationId) && !isAnonymous,
    networkMode: "online",
    queryKey: [
      "entitlements",
      "organization",
      region.id,
      userId ?? "anonymous",
      organizationId ?? "none",
    ],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error("Active organization is required");
      }
      const snapshot = parseEntitlementSnapshot(
        await api.get<unknown>("/v1/entitlements/me")
      );
      if (snapshot.organizationId !== organizationId) {
        throw new Error("Entitlement snapshot organization mismatch");
      }
      return snapshot;
    },
  });

  useEffect(() => {
    if (!(userId && organizationId) || isAnonymous || !snapshotQuery.data) {
      return;
    }
    writeEntitlementSnapshot(
      region.id,
      userId,
      organizationId,
      snapshotQuery.data
    );
  }, [isAnonymous, region.id, snapshotQuery.data, userId, organizationId]);

  const liveSnapshot =
    isOnline &&
    snapshotQuery.isSuccess &&
    snapshotQuery.isFetchedAfterMount &&
    !snapshotQuery.isRefetchError
      ? snapshotQuery.data
      : undefined;
  const selectedSnapshot = snapshotQuery.data ?? cachedSnapshot;
  const now = useExpiryClock(
    selectedSnapshot?.offlineAccessUntil ?? null,
    !liveSnapshot && Boolean(selectedSnapshot)
  );
  const expired = Boolean(
    !liveSnapshot &&
      selectedSnapshot?.offlineAccessUntil &&
      Date.parse(selectedSnapshot.offlineAccessUntil) <= now
  );

  const entitlements = useMemo(() => {
    if (isAnonymous || !selectedSnapshot || expired) {
      return resolveEntitlements();
    }
    return hydrateEntitlements(selectedSnapshot);
  }, [expired, isAnonymous, selectedSnapshot]);

  const status = useMemo<EntitlementStatus>(
    () => ({
      billingManagement: selectedSnapshot?.billingManagement ?? "unavailable",
      displayPlan: selectedSnapshot?.plan ?? PLAN.free,
      freshness: liveSnapshot
        ? "live"
        : expired
          ? "expired"
          : selectedSnapshot
            ? "cached"
            : "unverified",
      isOnline,
      verifiedAt: selectedSnapshot?.verifiedAt ?? null,
      usage: selectedSnapshot
        ? {
            resourceCount: selectedSnapshot.resourceCount,
            memberCount: selectedSnapshot.memberCount,
            pendingInvitationCount: selectedSnapshot.pendingInvitationCount,
            maxResources: selectedSnapshot.limits.max_resources,
            maxMembers: selectedSnapshot.limits.max_members,
          }
        : undefined,
      storage: selectedSnapshot?.storage
        ? {
            ...selectedSnapshot.storage,
            maxStorageBytes: selectedSnapshot.limits.max_storage_bytes,
            maxFileBytes: selectedSnapshot.limits.max_file_bytes,
          }
        : undefined,
    }),
    [expired, isOnline, liveSnapshot, selectedSnapshot]
  );
  const lastCapacity = useRef<string | null>(null);
  useEffect(() => {
    if (!liveSnapshot?.storage) {
      return;
    }
    const fingerprint = [
      organizationId,
      liveSnapshot.limits.max_storage_bytes,
      liveSnapshot.limits.max_file_bytes,
      liveSnapshot.storage.committedBytes,
      liveSnapshot.storage.reservedBytes,
    ].join(":");
    if (lastCapacity.current && lastCapacity.current !== fingerprint) {
      window.dispatchEvent(new Event("lunaris-storage-capacity-changed"));
    }
    lastCapacity.current = fingerprint;
  }, [liveSnapshot, organizationId]);
  const featureAccess =
    liveSnapshot?.features ?? resolvePlanFeatures(PLAN.free);
  const featureAccessPending =
    Boolean(userId && organizationId) &&
    !isAnonymous &&
    isOnline &&
    !liveSnapshot &&
    snapshotQuery.isFetching;

  const refresh = useCallback(async () => {
    await snapshotQuery.refetch();
    window.dispatchEvent(new Event("lunaris-storage-capacity-changed"));
  }, [snapshotQuery.refetch]);

  const maxResources = entitlements.limit(LIMIT.maxResources);
  const reserveResourceCapacity = useCallback<ReserveResourceCapacity>(
    async (count = 1) => {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new RangeError(
          "Resource reservation count must be a non-negative integer"
        );
      }
      if (count === 0 || maxResources === UNLIMITED) {
        return EMPTY_RESERVATION;
      }
      if (!organizationId) {
        throw new Error("Active organization is required");
      }

      let authoritativeResourceCount = selectedSnapshot?.resourceCount ?? 0;
      if (!isAnonymous && isOnline) {
        const refreshed = await snapshotQuery.refetch();
        authoritativeResourceCount =
          refreshed.data?.resourceCount ?? authoritativeResourceCount;
      }

      const { localCount, syncedCount } =
        await getOrganizationWorkspaceResourceUsage({
          db,
          organizationId,
        });
      const localOnlyCount = Math.max(0, localCount - syncedCount);
      const observedUsage =
        Math.max(authoritativeResourceCount, syncedCount) + localOnlyCount;
      const current =
        resourceCapacityByOrganization.current.get(organizationId);
      const confirmedDeletions = current
        ? Math.max(0, current.lastServerCount - authoritativeResourceCount) +
          Math.max(0, current.lastLocalOnlyCount - localOnlyCount)
        : 0;
      const state: ResourceCapacityState = {
        lastLocalOnlyCount: localOnlyCount,
        lastServerCount: authoritativeResourceCount,
        reservedCount: current?.reservedCount ?? 0,
        usageCount: Math.max(
          observedUsage,
          Math.max(
            0,
            (current?.usageCount ?? observedUsage) - confirmedDeletions
          )
        ),
      };
      resourceCapacityByOrganization.current.set(organizationId, state);

      if (state.usageCount + state.reservedCount + count > maxResources) {
        throw new ResourceCapacityExceededError(maxResources);
      }

      state.reservedCount += count;
      let remaining = count;
      const commit = (committedCount = remaining) => {
        if (
          !Number.isSafeInteger(committedCount) ||
          committedCount < 0 ||
          committedCount > remaining
        ) {
          throw new RangeError("Committed resource count exceeds reservation");
        }
        if (committedCount === 0) {
          return;
        }
        const latest =
          resourceCapacityByOrganization.current.get(organizationId);
        if (!latest) {
          return;
        }
        latest.reservedCount = Math.max(
          0,
          latest.reservedCount - committedCount
        );
        latest.usageCount += committedCount;
        remaining -= committedCount;
      };

      return {
        commit,
        rollback: () => {
          if (remaining === 0) {
            return;
          }
          const latest =
            resourceCapacityByOrganization.current.get(organizationId);
          if (latest) {
            latest.reservedCount = Math.max(
              0,
              latest.reservedCount - remaining
            );
          }
          remaining = 0;
        },
      };
    },
    [
      db,
      isAnonymous,
      isOnline,
      maxResources,
      selectedSnapshot?.resourceCount,
      snapshotQuery.refetch,
      organizationId,
    ]
  );

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      entitlements,
      featureAccess,
      featureAccessPending,
      refresh,
      reserveResourceCapacity,
      status,
    }),
    [
      entitlements,
      featureAccess,
      featureAccessPending,
      refresh,
      reserveResourceCapacity,
      status,
    ]
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

function useEntitlementsContext(): EntitlementsContextValue {
  const context = useContext(EntitlementsContext);
  if (!context) {
    throw new Error("Entitlement hooks require EntitlementsProvider");
  }
  return context;
}

export function useEntitlements(): ResolvedEntitlements {
  return useEntitlementsContext().entitlements;
}

export function useEntitlementStatus(): EntitlementStatus {
  return useEntitlementsContext().status;
}

export function useFeatureAccess(featureId: FeatureId): FeatureAccessResult {
  const { featureAccess, featureAccessPending } = useEntitlementsContext();
  return {
    allowed: featureAccess[featureId],
    pending: featureAccessPending,
  };
}

export function useRefreshEntitlements(): () => Promise<void> {
  return useEntitlementsContext().refresh;
}

export function useReserveResourceCapacity(): ReserveResourceCapacity {
  return useEntitlementsContext().reserveResourceCapacity;
}

export function useLimit(limitId: LimitId): number {
  return useEntitlements().limit(limitId);
}
