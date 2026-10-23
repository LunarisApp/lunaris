import { Button } from "@lunarisapp/ui/components/button";
import type { AuthClient } from "@repo/auth/client";
import { usePlatform } from "@repo/platform";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { useRegionClients } from "../../region";
import { AuthLayout } from "../components/auth-layout";

export default function AgentConsentPage() {
  const { navigation } = usePlatform();
  const { authClient } = useRegionClients();
  const location = useLocation();
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [loadedClient, setLoadedClient] = useState<{
    authClient: AuthClient;
    clientId: string;
    name?: string;
  }>();
  const query = new URLSearchParams(location.search);
  const clientId = query.get("client_id");
  const scopes = (query.get("scope") ?? "")
    .split(" ")
    .filter(
      (scope) =>
        scope && !["openid", "profile", "offline_access"].includes(scope)
    );

  useEffect(() => {
    let active = true;
    if (!(authClient && clientId)) {
      return;
    }

    void loadAgentClientName(authClient, clientId).then((name) => {
      if (active) {
        setLoadedClient({ authClient, clientId, name });
      }
    });

    return () => {
      active = false;
    };
  }, [authClient, clientId]);

  const clientName =
    loadedClient &&
    loadedClient.authClient === authClient &&
    loadedClient.clientId === clientId
      ? loadedClient.name
      : undefined;

  const decide = async (accept: boolean) => {
    if (!authClient || pending) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await submitAgentConsent(
        authClient,
        accept,
        location.search.slice(1)
      );
      const redirect = result.data?.redirect_uri ?? result.data?.url;
      if (redirect) {
        navigation.assign(redirect);
        return;
      }
      setError(result.error?.message ?? t("auth.agentConsentError"));
    } catch {
      setError(t("auth.agentConsentError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      description={t("auth.agentConsentDescription", {
        client: clientName ?? t("auth.agentConsentUnknownClient"),
      })}
      title={t("auth.agentConsentTitle")}
    >
      <ul className="mb-5 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
        {scopes.map((scope) => (
          <li key={scope}>{scope}</li>
        ))}
      </ul>
      {error ? (
        <p className="mb-3 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={pending}
          onClick={() => decide(true)}
        >
          {t("auth.agentConsentAllow")}
        </Button>
        <Button
          className="flex-1"
          disabled={pending}
          onClick={() => decide(false)}
          variant="outline"
        >
          {t("auth.agentConsentDeny")}
        </Button>
      </div>
    </AuthLayout>
  );
}

export async function loadAgentClientName(
  authClient: AuthClient,
  clientId: string
) {
  try {
    const result = await authClient.$fetch<{ client_name?: string }>(
      "/oauth2/public-client",
      {
        query: { client_id: clientId },
      }
    );
    const name = result.data?.client_name;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch {
    /* Metadata lookup is optional; fall back to the client ID. */
  }
}

export function submitAgentConsent(
  authClient: AuthClient,
  accept: boolean,
  oauthQuery: string
) {
  // Better Auth's dynamic proxy maps oauth2Consent to /oauth2-consent,
  // while OAuth Provider exposes the nested /oauth2/consent endpoint.
  return authClient.$fetch<{ redirect_uri?: string; url?: string }>(
    "/oauth2/consent",
    {
      body: { accept, oauth_query: getSignedOAuthQuery(oauthQuery) },
      method: "POST",
    }
  );
}

function getSignedOAuthQuery(search: string) {
  const params = new URLSearchParams(search);
  const signedNames = params.getAll("ba_param");
  // Older providers sign the whole query. Current providers declare which
  // parameters are signed so app routing parameters cannot break the signature.
  if (!signedNames.length) {
    return search;
  }
  const names = new Set([...signedNames, "ba_param", "sig"]);
  const signedParams = new URLSearchParams();
  for (const [name, value] of params) {
    if (names.has(name)) {
      signedParams.append(name, value);
    }
  }
  return signedParams.toString();
}
