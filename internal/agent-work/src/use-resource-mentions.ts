import { searchResultToEntityReferenceOption } from "@lunarisapp/plugin-sdk";
import { usePowerSync } from "@powersync/react";
import {
  createDeviceContentClient,
  createDeviceReadCoordinator,
} from "@repo/data/features/agent-content";
import { useCallback } from "react";

export function useResourceMentionSearch(organizationId: string) {
  const db = usePowerSync();
  return useCallback(
    async (search: string, signal: AbortSignal) => {
      const coordinator = createDeviceReadCoordinator(db, { timeoutMs: 1500 });
      const client = createDeviceContentClient(db, {
        activeOrganizationId: () => organizationId,
        readCoordinator: coordinator,
      });
      const abort = () => coordinator.dispose();
      signal.addEventListener("abort", abort, { once: true });
      try {
        signal.throwIfAborted();
        const input = { search, limit: 8 };
        const page = await client
          .searchResources(organizationId, input, { signal })
          .catch((error: unknown) => {
            if (signal.aborted) {
              throw error;
            }
            return client.searchResources(organizationId, input, {
              signal,
              consistency: "cached",
            });
          });
        return page.items.map(({ id, ...resource }) =>
          searchResultToEntityReferenceOption({ ...resource, resourceId: id })
        );
      } finally {
        signal.removeEventListener("abort", abort);
        coordinator.dispose();
      }
    },
    [db, organizationId]
  );
}
