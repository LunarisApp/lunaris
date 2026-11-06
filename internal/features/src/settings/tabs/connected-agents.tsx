import { Button } from "@lunarisapp/ui/components/button";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import {
  ArrowDown01Icon,
  HugeiconsIcon,
  PlugSocketIcon,
} from "@lunarisapp/ui/icons";
import type { AuthClient } from "@repo/auth/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { agentAuthFetch } from "../../auth/agent-auth-client";
import { useRegionClients } from "../../region";

interface ConnectedGrant {
  clientName: string;
  id: string;
  organizationIds: string[];
  resource: string;
  scopes: string[];
  updatedAt: string;
}
export function ConnectedAgents() {
  const { authClient, manifest } = useRegionClients();
  return authClient ? (
    <ConnectedAgentsContent auth={authClient} apiUrl={manifest?.apiUrl} />
  ) : null;
}

function ConnectedAgentsContent({
  auth,
  apiUrl,
}: {
  auth: AuthClient;
  apiUrl?: string;
}) {
  const { t, i18n } = useTranslation();
  const { data: session } = auth.useSession();
  const grants = useQuery({
    queryKey: ["connected-agents", apiUrl, session?.user.id],
    queryFn: () =>
      agentAuthFetch<{ grants: ConnectedGrant[] }>(auth, "/agent/grants"),
    enabled: !!session,
  });
  const organizations = useQuery({
    queryKey: ["connected-agent-organizations", apiUrl, session?.user.id],
    queryFn: async () => {
      const result = await auth.organization.list();
      if (result.error) {
        throw new Error(t("auth.agentAuthorization.organizationNamesFailed"), {
          cause: result.error,
        });
      }
      return result.data ?? [];
    },
    enabled: !!session,
  });
  const organizationNames = new Map(
    organizations.data?.map((organization) => [
      organization.id,
      organization.name,
    ])
  );
  const revoke = useMutation({
    mutationFn: (id: string) => agentAuthFetch(auth, "/agent/revoke", { id }),
    onSuccess: () => grants.refetch(),
  });
  return (
    <section
      aria-labelledby="connected-agents-title"
      className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
    >
      <header className="space-y-1.5">
        <h2 id="connected-agents-title" className="font-semibold text-base">
          {t("auth.agentAuthorization.connectedTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("auth.agentAuthorization.connectedDescription")}
        </p>
      </header>
      <div className="min-w-0 max-w-3xl">
        {grants.isPending ? (
          <div className="flex items-center gap-3 py-4" role="status">
            <span className="sr-only">
              {t("auth.agentAuthorization.loading")}
            </span>
            <Skeleton aria-hidden="true" className="size-8 rounded-lg" />
            <div aria-hidden="true" className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
          </div>
        ) : null}
        {grants.error ? (
          <div className="space-y-2 py-4">
            <p role="alert" className="text-destructive text-sm">
              {t("auth.agentAuthorization.loadFailed")}
            </p>
            <Button
              disabled={grants.isFetching}
              onClick={() => void grants.refetch()}
              size="sm"
              variant="outline"
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {grants.data?.grants.length === 0 ? (
          <p className="py-4 text-muted-foreground text-sm">
            {t("auth.agentAuthorization.noAgents")}
          </p>
        ) : null}
        {organizations.error && grants.data?.grants.length ? (
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <p role="alert" className="text-muted-foreground text-sm">
              {t("auth.agentAuthorization.organizationNamesFailed")}
            </p>
            <Button
              disabled={organizations.isFetching}
              onClick={() => void organizations.refetch()}
              size="sm"
              variant="outline"
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        <ul className="divide-y">
          {grants.data?.grants.map((grant) => (
            <li key={grant.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={PlugSocketIcon}
                    className="size-4"
                    strokeWidth={2}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="wrap-anywhere font-medium text-sm">
                    {grant.clientName}
                  </p>
                  {grant.organizationIds.length ? (
                    <p className="wrap-anywhere text-muted-foreground text-xs">
                      {grant.organizationIds
                        .map(
                          (id) =>
                            organizationNames.get(id) ??
                            t("auth.agentAuthorization.unknownOrganization")
                        )
                        .join(", ")}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {t("auth.agentAuthorization.reconnectRequired")}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    <time dateTime={grant.updatedAt}>
                      {t("auth.agentAuthorization.updated", {
                        date: new Date(grant.updatedAt).toLocaleDateString(
                          i18n.resolvedLanguage,
                          { month: "short", day: "numeric", year: "numeric" }
                        ),
                      })}
                    </time>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-8"
                  disabled={revoke.isPending}
                  aria-busy={revoke.isPending && revoke.variables === grant.id}
                  aria-label={t("auth.agentAuthorization.revokeNamed", {
                    client: grant.clientName,
                  })}
                  onClick={() => revoke.mutate(grant.id)}
                >
                  {t(
                    revoke.isPending && revoke.variables === grant.id
                      ? "auth.agentAuthorization.revoking"
                      : "auth.agentAuthorization.revoke"
                  )}
                </Button>
              </div>
              {revoke.error && revoke.variables === grant.id ? (
                <p role="alert" className="text-destructive text-sm">
                  {t("auth.agentAuthorization.revokeFailed")}
                </p>
              ) : null}
              <details className="group ml-11">
                <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 sm:min-h-8 [&::-webkit-details-marker]:hidden">
                  {t("auth.agentAuthorization.grantedPermissions", {
                    count: grant.scopes.length,
                  })}
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={ArrowDown01Icon}
                    className="size-3 group-open:rotate-180"
                    strokeWidth={2}
                  />
                </summary>
                <div className="space-y-4 pt-2 pb-1">
                  <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {grant.scopes.map((scope) => (
                      <li key={scope} className="wrap-anywhere">
                        {t(
                          `auth.agentAuthorization.scopes.${scope.replace(":", "_")}`,
                          { defaultValue: scope }
                        )}
                      </li>
                    ))}
                  </ul>
                  <dl className="space-y-1 text-xs">
                    <dt className="font-medium">
                      {t("auth.agentAuthorization.audience")}
                    </dt>
                    <dd className="break-all text-muted-foreground">
                      {grant.resource}
                    </dd>
                  </dl>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
