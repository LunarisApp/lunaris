import { Appbar } from "@repo/features/appbar";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAgentWorkAccess } from "./session";
import { AgentWorkView, type AgentWorkPresentation } from "./view";

/** Both presentations use the same account scope, lifecycle, and agent implementation. */
export function AgentWorkRoot(props: AgentWorkPresentation) {
  const { t } = useTranslation();
  const { allowed, kind, pending, scope } = useAgentWorkAccess();
  if (scope) {
    return (
      <AgentWorkView {...props} key={JSON.stringify(scope)} scope={scope} />
    );
  }
  if (pending || !allowed || kind === "desktop") {
    return props.variant === "panel" ? null : (
      <AgentNotice {...props}>
        {pending || allowed ? (
          <div role="status" className="flex items-center gap-2">
            <Spinner aria-hidden="true" />
            {t("common.loading")}
          </div>
        ) : (
          <h2 className="font-medium text-lg">{t("agentWork.unavailable")}</h2>
        )}
      </AgentNotice>
    );
  }
  return (
    <AgentNotice {...props}>
      <div className="max-w-md text-center">
        <h2 className="font-medium text-lg">
          {t("agentWork.desktopOnlyTitle")}
        </h2>
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          {t("agentWork.desktopOnly")}
        </p>
      </div>
    </AgentNotice>
  );
}

function AgentNotice(props: AgentWorkPresentation & { children: ReactNode }) {
  const notice = (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      {props.children}
    </div>
  );
  if (props.variant === "panel") {
    return (
      <section className="flex h-full min-h-0 flex-col text-foreground">
        {notice}
      </section>
    );
  }
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-sidebar px-2.5 pb-2.5 text-foreground">
      <Appbar className="shrink-0">
        <Appbar.Leading>
          <props.AppBarLeading />
        </Appbar.Leading>
        <Appbar.Trailing>
          <props.AppBarTrailing />
        </Appbar.Trailing>
      </Appbar>
      {notice}
    </div>
  );
}
