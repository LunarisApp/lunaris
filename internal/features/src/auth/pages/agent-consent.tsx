import type { AuthClient } from "@repo/auth/client";
import { usePlatform } from "@repo/platform";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { useRegionClients } from "../../region";
import {
  AgentAuthorizationGate,
  AgentAuthorizationReview,
} from "../components/agent-authorization";
import { AuthLayout } from "../components/auth-layout";

export default function AgentConsentPage() {
  const { navigation } = usePlatform();
  const { authClient } = useRegionClients();
  const location = useLocation();
  const { t } = useTranslation();
  return (
    <AuthLayout title={t("auth.agentConsentTitle")}>
      <AgentAuthorizationGate>
        {authClient ? (
          <AgentAuthorizationReview
            key={location.search}
            auth={authClient}
            request={{
              oauth_query: getSignedOAuthQuery(location.search.slice(1)),
            }}
            onDecision={async (accept) => {
              const result = await submitAgentConsent(
                authClient,
                accept,
                location.search.slice(1)
              );
              const redirect = result.data?.redirect_uri ?? result.data?.url;
              if (!redirect) {
                throw new Error(
                  result.error?.message ?? t("auth.agentConsentError")
                );
              }
              navigation.assign(redirect);
            }}
          />
        ) : null}
      </AgentAuthorizationGate>
    </AuthLayout>
  );
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
