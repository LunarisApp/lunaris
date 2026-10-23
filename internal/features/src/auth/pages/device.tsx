import { Button } from "@lunarisapp/ui/components/button";
import { Input } from "@lunarisapp/ui/components/input";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router";
import { useRegionClients } from "../../region";
import {
  AgentAuthorizationGate,
  AgentAuthorizationReview,
} from "../components/agent-authorization";
import { agentAuthFetch } from "../agent-auth-client";
import { AuthLayout } from "../components/auth-layout";

export default function DeviceAuthorizationPage() {
  const { t } = useTranslation();
  const { authClient } = useRegionClients();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const [code, setCode] = useState(
    new URLSearchParams(location.search).get("user_code") ?? ""
  );
  const [confirmedCode, setConfirmedCode] = useState("");
  const [done, setDone] = useState<"approved" | "denied">();
  return (
    <AuthLayout
      title={t("auth.agentAuthorization.deviceTitle")}
      description={
        confirmedCode || done
          ? undefined
          : t("auth.agentAuthorization.deviceDescription")
      }
    >
      <AgentAuthorizationGate>
        {done ? (
          <p role="status">{t(`auth.agentAuthorization.${done}`)}</p>
        ) : confirmedCode && authClient ? (
          <AgentAuthorizationReview
            key={confirmedCode}
            auth={authClient}
            request={{ userCode: confirmedCode }}
            onBack={() => setConfirmedCode("")}
            beforeLoad={async () => {
              await agentAuthFetch(
                authClient,
                `/device?user_code=${encodeURIComponent(confirmedCode)}`
              );
            }}
            onDecision={async (accept) => {
              await agentAuthFetch(
                authClient,
                accept ? "/device/approve" : "/device/deny",
                { userCode: confirmedCode }
              );
              setDone(accept ? "approved" : "denied");
            }}
          />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const userCode = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
              setConfirmedCode(userCode);
              // Keep the reviewed code when account switching reloads this page.
              setSearchParams(
                (params) => {
                  params.set("user_code", userCode);
                  return params;
                },
                { replace: true }
              );
            }}
          >
            <label className="block space-y-2" htmlFor="device-user-code">
              <span>{t("auth.agentAuthorization.code")}</span>
              <Input
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                id="device-user-code"
                value={code}
                required
                maxLength={32}
                onChange={(event) => {
                  const value = event.target.value;
                  setCode(value);
                  setSearchParams(
                    (params) => {
                      params.set("user_code", value);
                      return params;
                    },
                    { replace: true }
                  );
                }}
              />
            </label>
            <p className="text-muted-foreground text-sm">
              {t("auth.agentAuthorization.confirmCode")}
            </p>
            <Button
              className="w-full"
              type="submit"
              disabled={!code.replace(/[^a-zA-Z0-9]/g, "")}
            >
              {t("auth.agentAuthorization.review")}
            </Button>
          </form>
        )}
      </AgentAuthorizationGate>
    </AuthLayout>
  );
}
