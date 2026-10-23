import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import { Button } from "@lunarisapp/ui/components/button";
import type { AuthClient } from "@repo/auth/client";
import { usePlatform } from "@repo/platform";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useRegion, useRegionClients } from "../../region";
import { agentAuthFetch } from "../agent-auth-client";
import {
  appendRedirectToPath,
  buildAddAccountPath,
  buildAuthRedirectPath,
} from "../redirect";

export interface AuthorizationRequest {
  oauth_query?: string;
  userCode?: string;
}
export interface AuthorizationDetails {
  clientId: string;
  clientName: string;
  organizations: { id: string; name: string }[];
  resources: string[];
  scopes: string[];
}
/** OAuth approval needs a verified session, but never PowerSync or an active workspace. */
export function AgentAuthorizationGate({ children }: { children: ReactNode }) {
  const { authClient, manifest } = useRegionClients();
  if (!(authClient && manifest)) {
    return null;
  }
  return (
    <SessionGate auth={authClient} apiUrl={manifest.apiUrl}>
      {children}
    </SessionGate>
  );
}
function SessionGate({
  auth,
  apiUrl,
  children,
}: {
  auth: AuthClient;
  apiUrl: string;
  children: ReactNode;
}) {
  const { data: session, isPending } = auth.useSession();
  const { pathWithRegion } = useRegion();
  const location = useLocation();
  const { t } = useTranslation();
  const issuer = new URLSearchParams(location.search).get("issuer");
  if (issuer && issuer.replace(/\/$/, "") !== apiUrl.replace(/\/$/, "")) {
    return <p role="alert">{t("auth.agentAuthorization.regionMismatch")}</p>;
  }
  if (isPending) {
    return <p role="status">{t("auth.agentAuthorization.loading")}</p>;
  }
  if (!session || session.user.isAnonymous) {
    return (
      <Navigate
        replace
        to={buildAuthRedirectPath(pathWithRegion("/auth"), location)}
      />
    );
  }
  if (!session.user.emailVerified) {
    return (
      <Navigate
        replace
        to={appendRedirectToPath(
          pathWithRegion("/auth/verify-email"),
          `${location.pathname}${location.search}`
        )}
      />
    );
  }
  return (
    <AuthorizationAccount key={session.user.id} auth={auth}>
      {children}
    </AuthorizationAccount>
  );
}

const AuthorizationBusyContext = createContext<(busy: boolean) => void>(
  () => undefined
);

function AuthorizationAccount({
  auth,
  children,
}: {
  auth: AuthClient;
  children: ReactNode;
}) {
  const { data: session } = auth.useSession();
  const { navigation } = usePlatform();
  const { t } = useTranslation();
  const { pathWithRegion, region } = useRegion();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [deciding, setDeciding] = useState(false);
  const accounts = useQuery({
    queryKey: ["authorization-accounts", region.id, session?.user.id],
    queryFn: async () => {
      const result = await auth.multiSession.listDeviceSessions();
      if (result.error) {
        throw new Error(result.error.message ?? t("auth.accountListFailed"));
      }
      return result.data ?? [];
    },
    retry: false,
    gcTime: 0,
  });
  const users = new Map(
    (accounts.data ?? [])
      .filter(
        (account) =>
          !("isAnonymous" in account.user && account.user.isAnonymous)
      )
      .map((account) => [account.user.id, account])
  );
  if (session) {
    users.set(session.user.id, session);
  }
  const changeAccount = async (userId: string | null) => {
    if (!userId || userId === session?.user.id || pending || deciding) {
      return;
    }
    const account = users.get(userId);
    if (!account) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await auth.multiSession.setActive({
        sessionToken: account.session.token,
      });
      if (result.error) {
        throw new Error(result.error.message ?? t("auth.agentConsentError"));
      }
      // Reload from the new cookie before exposing any consent controls.
      navigation.assign(
        `${location.pathname}${location.search}${location.hash}`
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("auth.agentConsentError")
      );
      setPending(false);
    }
  };
  const signOut = async () => {
    if (pending || deciding) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await auth.signOut();
      if (result.error) {
        throw new Error(result.error.message ?? t("auth.agentConsentError"));
      }
      navigate(buildAddAccountPath(pathWithRegion("/auth"), location), {
        replace: true,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("auth.agentConsentError")
      );
      setPending(false);
    }
  };
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {users.size > 1 ? (
          <label
            htmlFor="authorization-account"
            className="block font-medium text-sm"
          >
            {t("auth.switchAccount")}
          </label>
        ) : (
          <p className="font-medium text-sm">{t("auth.accounts")}</p>
        )}
        {users.size > 1 ? (
          <Select
            value={session?.user.id ?? null}
            onValueChange={(value) => void changeAccount(value)}
            disabled={pending || deciding}
            items={[...users.values()].map((account) => ({
              value: account.user.id,
              label: account.user.email,
            }))}
          >
            <SelectTrigger
              id="authorization-account"
              className="min-h-11 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...users.values()].map((account) => (
                <SelectItem key={account.user.id} value={account.user.id}>
                  {account.user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p id="authorization-account" className="break-all text-sm">
            {session?.user.email}
          </p>
        )}
        {accounts.error ? (
          <div className="space-y-2">
            <p role="alert" className="text-destructive text-sm">
              {t("auth.accountListFailed")}
            </p>
            <Button
              variant="outline"
              disabled={pending || deciding || accounts.isFetching}
              onClick={() => void accounts.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={pending || deciding}
          onClick={() => void signOut()}
        >
          {t("common.logout")}
        </Button>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
      {pending ? (
        <p role="status">{t("auth.agentAuthorization.loading")}</p>
      ) : (
        <AuthorizationBusyContext.Provider value={setDeciding}>
          {children}
        </AuthorizationBusyContext.Provider>
      )}
    </div>
  );
}

export function AgentAuthorizationReview({
  auth,
  request,
  beforeLoad,
  onDecision,
  onBack,
}: {
  auth: AuthClient;
  request: AuthorizationRequest;
  beforeLoad?: () => Promise<void>;
  onDecision: (accept: boolean) => Promise<void>;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const setDeciding = useContext(AuthorizationBusyContext);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const { manifest } = useRegionClients();
  const { data: session } = auth.useSession();
  const details = useQuery({
    queryKey: [
      "agent-authorization",
      manifest?.apiUrl,
      session?.user.id,
      request,
    ],
    queryFn: async () => {
      await beforeLoad?.();
      return agentAuthFetch<AuthorizationDetails>(
        auth,
        "/agent/authorization",
        request
      );
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const decide = async (accept: boolean) => {
    if (pending) {
      return;
    }
    setPending(true);
    setDeciding(true);
    setError(undefined);
    try {
      if (accept) {
        await agentAuthFetch(auth, "/agent/authorize", {
          ...request,
          organizationIds: selected,
        });
      }
      await onDecision(accept);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("auth.agentConsentError")
      );
    } finally {
      setPending(false);
      setDeciding(false);
    }
  };
  if (details.isPending) {
    return <p role="status">{t("auth.agentAuthorization.loading")}</p>;
  }
  if (details.error) {
    return (
      <div className="space-y-3">
        <p role="alert">{details.error.message}</p>
        <Button onClick={() => void details.refetch()}>
          {t("common.retry")}
        </Button>
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            {t("auth.agentAuthorization.changeCode")}
          </Button>
        ) : null}
      </div>
    );
  }
  const data = details.data;
  return (
    <div className="space-y-4">
      <div className="space-y-1 break-words">
        <p className="font-medium">{data.clientName}</p>
      </div>
      <div>
        <h2 className="mb-2 font-medium text-sm">
          {t("auth.agentAuthorization.permissions")}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {data.scopes
            .filter(
              (scope) =>
                !["openid", "profile", "offline_access"].includes(scope)
            )
            .map((scope) => (
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
      </div>
      <div className="space-y-2">
        <label
          htmlFor="agent-organizations"
          className="block font-medium text-sm"
        >
          {t("auth.agentAuthorization.organizations")}
        </label>
        {data.organizations.length ? (
          <Select
            multiple
            value={selected}
            onValueChange={setSelected}
            disabled={pending}
            items={data.organizations.map((org) => ({
              value: org.id,
              label: org.name,
            }))}
          >
            <SelectTrigger id="agent-organizations" className="min-h-11 w-full">
              <SelectValue
                placeholder={t("auth.agentAuthorization.selectOrganizations")}
              />
            </SelectTrigger>
            <SelectContent>
              {data.organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("auth.agentAuthorization.noOrganizations")}
          </p>
        )}
      </div>
      <details className="text-muted-foreground text-xs">
        <summary className="min-h-11 w-fit cursor-pointer rounded-sm py-3 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">
          {t("auth.agentAuthorization.connectionDetails")}
        </summary>
        <div className="mt-3 space-y-3 break-words">
          <p>{t("auth.agentAuthorization.unverifiedClient")}</p>
          {data.scopes.includes("offline_access") ? (
            <p>{t("auth.agentAuthorization.persistentShort")}</p>
          ) : null}
          <dl className="space-y-2">
            <div>
              <dt className="font-medium">
                {t("auth.agentAuthorization.clientId")}
              </dt>
              <dd className="break-all">{data.clientId}</dd>
            </div>
            <div>
              <dt className="font-medium">
                {t("auth.agentAuthorization.audience")}
              </dt>
              <dd className="break-all">{data.resources.join(", ")}</dd>
            </div>
          </dl>
          {onBack ? (
            <Button
              className="h-auto p-0 text-xs"
              variant="link"
              disabled={pending}
              onClick={onBack}
            >
              {t("auth.agentAuthorization.changeCode")}
            </Button>
          ) : null}
        </div>
      </details>
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            className="min-h-11 flex-1"
            disabled={pending || !selected.length}
            onClick={() => void decide(true)}
          >
            {t("auth.agentConsentAllow")}
          </Button>
          <Button
            className="min-h-11 flex-1"
            disabled={pending}
            variant="outline"
            onClick={() => void decide(false)}
          >
            {t("auth.agentConsentDeny")}
          </Button>
        </div>
      </div>
    </div>
  );
}
