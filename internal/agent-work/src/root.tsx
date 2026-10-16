import { Appbar } from "@repo/features/appbar";
import { usePlatform } from "@repo/platform";
import { useTranslation } from "react-i18next";
import { FEATURE } from "@repo/auth/entitlements";
import { useFeatureAccess } from "@repo/features/entitlements";
import { useApi } from "@repo/features/api";
import { useAuth } from "@repo/features/auth";
import { AgentWorkView, type AgentWorkPresentation } from "./view";

/** Both presentations use the same account scope, lifecycle, and agent implementation. */
export function AgentWorkRoot(props: AgentWorkPresentation) {
  const platform = usePlatform();
  const auth = useAuth();
  const api = useApi();
  const { data: session } = auth.useSession();
  const { allowed, pending } = useFeatureAccess(FEATURE.agentWork);
  if (pending || !allowed) {
    return null;
  }
  if (platform.kind === "web") {
    return <DesktopOnly {...props} />;
  }
  const organizationId = session?.session.activeOrganizationId;
  if (!(session?.user.id && organizationId)) {
    return null;
  }
  const scope = {
    userId: session.user.id,
    organizationId,
    apiUrl: api.baseUrl,
  };
  return <AgentWorkView {...props} key={JSON.stringify(scope)} scope={scope} />;
}

function DesktopOnly(props: AgentWorkPresentation) {
  const { t } = useTranslation();
  const notice = (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="max-w-md text-center">
        <h2 className="font-medium text-lg">
          {t("agentWork.desktopOnlyTitle")}
        </h2>
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          {t("agentWork.desktopOnly")}
        </p>
      </div>
    </div>
  );
  if (props.variant === "panel") {
    return (
      <section className="flex h-full min-h-0 flex-col bg-background text-foreground">
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
