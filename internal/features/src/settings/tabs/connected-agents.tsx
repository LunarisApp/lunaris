import { Button } from "@lunarisapp/ui/components/button";
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
  const { t } = useTranslation();
  const { data: session } = auth.useSession();
  const grants = useQuery({
    queryKey: ["connected-agents", apiUrl, session?.user.id],
    queryFn: () =>
      agentAuthFetch<{ grants: ConnectedGrant[] }>(auth, "/agent/grants"),
    enabled: !!session,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => agentAuthFetch(auth, "/agent/revoke", { id }),
    onSuccess: () => grants.refetch(),
  });
  return (
    <section aria-labelledby="connected-agents-title" className="space-y-4">
      <header>
        <h2 id="connected-agents-title" className="font-semibold text-base">
          {t("auth.agentAuthorization.connectedTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("auth.agentAuthorization.connectedDescription")}
        </p>
      </header>
      {grants.isPending ? (
        <p role="status">{t("auth.agentAuthorization.loading")}</p>
      ) : null}
      {grants.error || revoke.error ? (
        <p role="alert" className="text-destructive text-sm">
          {(grants.error ?? revoke.error)?.message}
        </p>
      ) : null}
      {grants.data?.grants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("auth.agentAuthorization.noAgents")}
        </p>
      ) : null}
      <ul className="divide-y">
        {grants.data?.grants.map((grant) => (
          <li key={grant.id} className="space-y-2 py-4">
            <p className="font-medium">{grant.clientName}</p>
            <p className="break-all text-muted-foreground text-sm">
              {grant.resource}
            </p>
            <ul className="list-disc pl-5 text-sm">
              {grant.scopes.map((scope) => (
                <li key={scope}>
                  {t(
                    `auth.agentAuthorization.scopes.${scope.replace(":", "_")}`,
                    {
                      defaultValue: scope,
                    }
                  )}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {t("auth.agentAuthorization.organizations")}:{" "}
              {grant.organizationIds.join(", ")}
            </p>
            <p className="text-muted-foreground text-xs">
              {new Date(grant.updatedAt).toLocaleString()}
            </p>
            <Button
              variant="outline"
              disabled={revoke.isPending}
              aria-label={t("auth.agentAuthorization.revokeNamed", {
                client: grant.clientName,
              })}
              onClick={() => revoke.mutate(grant.id)}
            >
              {t("auth.agentAuthorization.revoke")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
