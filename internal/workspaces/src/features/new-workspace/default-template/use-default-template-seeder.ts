import { SYNC_ACCESS, usePowerSync, useSyncAccess } from "@repo/data/core";
import {
  useWorkspacesQuery,
  WORKSPACE_INDEX_SYNC_STREAMS,
} from "@repo/data/features/workspaces";
import { log, parseError } from "evlog";
import { useEffect, useRef } from "react";
import { useReserveResourceCapacity } from "@repo/features/entitlements";
import { useCanCreateWorkspace } from "@repo/workspaces/permissions";
import {
  clearDefaultWorkspaceSeedMarker,
  readDefaultWorkspaceSeedMarker,
} from "./seed-marker";
import { DEFAULT_TEMPLATE_ITEM_COUNT } from "./seed-metadata";

export function useDefaultTemplateWorkspaceSeeder(params: {
  currentUserEmail?: string | null;
  organizationId?: string;
}) {
  const { currentUserEmail, organizationId } = params;
  const db = usePowerSync();
  const reserveResourceCapacity = useReserveResourceCapacity();
  const syncAccess = useSyncAccess();
  const canCreate = useCanCreateWorkspace();
  const inFlightRef = useRef(false);
  const workspacesQuery = useWorkspacesQuery({
    options:
      syncAccess === SYNC_ACCESS.cloud
        ? { streams: WORKSPACE_INDEX_SYNC_STREAMS }
        : undefined,
    organizationId,
  });
  const workspaces = workspacesQuery.data ?? [];

  useEffect(() => {
    if (
      !(organizationId && canCreate) ||
      workspacesQuery.isLoading ||
      workspacesQuery.isFetching ||
      inFlightRef.current
    ) {
      return;
    }

    const marker = readDefaultWorkspaceSeedMarker();
    if (!marker) {
      return;
    }

    if (workspaces.length > 0) {
      clearDefaultWorkspaceSeedMarker();
      return;
    }

    if (marker.kind === "registered") {
      if (!currentUserEmail) {
        return;
      }
      if (marker.email.toLowerCase() !== currentUserEmail.toLowerCase()) {
        clearDefaultWorkspaceSeedMarker();
        return;
      }
    }

    inFlightRef.current = true;
    void (async () => {
      const { seedDefaultTemplateWorkspace } = await import("./seed-service");
      const resourceCapacityReservation = await reserveResourceCapacity(
        DEFAULT_TEMPLATE_ITEM_COUNT
      );
      await seedDefaultTemplateWorkspace({
        db,
        resourceCapacityReservation,
        organizationId,
      });
      clearDefaultWorkspaceSeedMarker();
    })()
      .catch((error) => {
        log.error({
          tag: "Workspace",
          msg: "default template seed failed",
          error: parseError(error),
        });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [
    currentUserEmail,
    canCreate,
    db,
    organizationId,
    workspaces.length,
    workspacesQuery.isFetching,
    workspacesQuery.isLoading,
    reserveResourceCapacity,
  ]);
}
