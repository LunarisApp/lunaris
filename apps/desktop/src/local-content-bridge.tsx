import { usePowerSync } from "@repo/data/core";
import {
  createDeviceControlClient,
  createDeviceReadCoordinator,
} from "@repo/data/features/agent-content";
import { useOrganizationsQuery } from "@repo/data/features/organizations";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth";
import { serializeErrorForLog } from "@repo/utils/log-error";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { log } from "evlog";
import { useEffect, useMemo, useState } from "react";
import { CloudLunarisControlClient } from "./agent-client/cloud-client";
import { createHybridControlClient } from "./hybrid-control-client";
import {
  type LocalContentRequest,
  routeLocalContentRequest,
} from "./local-content-router";
import {
  isOrganizationDirectoryCurrent,
  resolveOrganizationDirectory,
} from "./organization-directory";
import { registerAgentWorkResources } from "./agent-work";
import { organizationRevision } from "./organization-revision";

const REQUEST_EVENT = "lunaris://agent-content/request";

export function DesktopLocalContentBridge() {
  const db = usePowerSync();
  const api = useApi();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const { data: activeOrganization } = auth.useActiveOrganization();
  const userId = session?.user.id;
  const isAnonymous = session?.user.isAnonymous === true;
  const activeOrganizationId = session?.session.activeOrganizationId;
  const organizationsQuery = useOrganizationsQuery();
  const organizationDirectory = useMemo(
    () =>
      userId
        ? resolveOrganizationDirectory(
            organizationsQuery.data ?? [],
            activeOrganization,
            isAnonymous || organizationsQuery.isLoading,
          )
        : [],
    [
      activeOrganization,
      isAnonymous,
      userId,
      organizationsQuery.data,
      organizationsQuery.isLoading,
    ],
  );
  const liveOrganizationKey = useMemo(
    () =>
      userId
        ? JSON.stringify([
            userId,
            organizationDirectory.map((organization) => [
              organization.id,
              organization.name,
              organization.slug,
              organization.logo ?? null,
              organization.createdAt,
            ]),
          ])
        : undefined,
    [organizationDirectory, userId],
  );
  const [liveOrganizationState, setLiveOrganizationState] = useState<{
    key: string;
    organizations: AgentOrganization[];
  }>();
  const liveOrganizations =
    liveOrganizationState && liveOrganizationState.key === liveOrganizationKey
      ? liveOrganizationState.organizations
      : undefined;
  useEffect(() => {
    let active = true;
    if (!liveOrganizationKey) {
      return () => {
        active = false;
      };
    }
    void Promise.all(
      organizationDirectory.map(async (organization) => {
        const logo = organization.logo ?? null;
        return {
          createdAt: organization.createdAt,
          id: organization.id,
          logo,
          name: organization.name,
          revision: await organizationRevision({
            logo,
            name: organization.name,
            slug: organization.slug,
          }),
          slug: organization.slug,
        };
      }),
    ).then((values) => {
      if (active) {
        setLiveOrganizationState({
          key: liveOrganizationKey,
          organizations: values,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [liveOrganizationKey, organizationDirectory]);
  const organizations = userId ? (liveOrganizations ?? []) : [];
  const directoryCurrent = isOrganizationDirectoryCurrent(organizationsQuery);
  const readCoordinator = useMemo(
    () => createDeviceReadCoordinator(db),
    [activeOrganizationId, db, userId],
  );
  useEffect(() => () => readCoordinator.dispose(), [readCoordinator]);
  const localClient = useMemo(
    () =>
      createDeviceControlClient(db, {
        activeOrganizationId: () => activeOrganizationId,
        actorId: () => userId,
        readCoordinator,
        organizations: () => organizations,
        organizationSnapshot: () => ({
          completeness:
            liveOrganizations && directoryCurrent ? "complete" : "partial",
          confirmedAt:
            liveOrganizations && directoryCurrent
              ? new Date().toISOString()
              : null,
          syncState:
            liveOrganizations && directoryCurrent ? "current" : "stale",
        }),
      }),
    [
      activeOrganizationId,
      db,
      directoryCurrent,
      liveOrganizations,
      readCoordinator,
      userId,
      organizations,
    ],
  );
  const cloudClient = useMemo(
    () =>
      new CloudLunarisControlClient({
        baseUrl: api.baseUrl,
        fetch: async (input, init) => {
          try {
            return await api.fetch(input, init);
          } catch (error) {
            if (httpStatus(error) > 0) throw error;
            throw new TypeError("Desktop cloud request is unavailable", {
              cause: error,
            });
          }
        },
        timeoutMs: 25_000,
      }),
    [api],
  );
  const client = useMemo(
    () => createHybridControlClient(localClient, cloudClient),
    [cloudClient, localClient],
  );

  useEffect(() => {
    if (!userId || !activeOrganizationId) return;
    return registerAgentWorkResources({
      client,
      scope: {
        userId,
        organizationId: activeOrganizationId,
        apiUrl: api.baseUrl,
      },
    });
  }, [activeOrganizationId, api.baseUrl, client, userId]);

  useEffect(() => {
    let active = true;
    const unlisten = listen<LocalContentRequest>(REQUEST_EVENT, (event) => {
      void routeLocalContentRequest(client, event.payload)
        .then((response) => {
          if (!active) return;
          return invoke("agent_content_respond", {
            body: response.body,
            requestId: event.payload.id,
            status: response.status,
          });
        })
        .catch((error: unknown) => {
          log.error({
            action: "desktop.agent.response.return",
            agent: { requestId: event.payload.id },
            error: serializeErrorForLog(error),
            outcome: "failure",
          });
        });
    }).catch((error: unknown) => {
      log.error({
        action: "desktop.agent.bridge.register",
        error: serializeErrorForLog(error),
        outcome: "failure",
      });
      return () => undefined;
    });
    return () => {
      active = false;
      void unlisten.then((dispose) => dispose());
    };
  }, [client]);

  return null;
}

function httpStatus(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  return 0;
}

interface AgentOrganization {
  createdAt: string;
  id: string;
  logo: string | null;
  name: string;
  revision: string;
  slug: string;
}
