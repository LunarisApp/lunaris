"use client";

import { Button } from "@lunarisapp/ui/components/button";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAuth } from "../../auth";
import { AgentAccessSection } from "./agent-access-section";
import { ConnectedAgents } from "./connected-agents";

export function AgentsContent() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: session } = auth.useSession();

  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-12"
      data-testid="settings-panel-agents"
    >
      <AgentAccessSection />
      {session && !session.user.isAnonymous ? (
        <ConnectedAgents />
      ) : session?.user.isAnonymous ? (
        <section
          className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
          aria-labelledby="agents-sign-in-heading"
        >
          <h2 className="font-semibold text-base" id="agents-sign-in-heading">
            {t("auth.agentAuthorization.connectedTitle")}
          </h2>
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {t("settings.agents.signInDescription")}
            </p>
            <Button
              className="h-11 sm:h-8"
              render={<Link to="/auth" />}
              variant="outline"
            >
              {t("auth.signIn")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
