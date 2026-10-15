import { Button } from "@lunarisapp/ui/components/button";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { CloudOffIcon } from "@lunarisapp/ui/icons";
import type { AuthClient } from "@repo/auth/client";
import { resolveSyncAccess } from "@repo/auth/sync-access";
import {
  isOfflineEncryptionKeyError,
  PowerSyncProvider,
} from "@repo/data/core";
import type { ApiClient } from "@repo/data/http";
import { ApiProvider } from "@repo/features/api";
import { DebugLoggingSync } from "@repo/features/debug-logging";
import { EntitlementsProvider } from "@repo/features/entitlements";
import { LoaderView } from "@repo/features/loading";
import {
  type RegionManifest,
  useRegionClients,
} from "@repo/features/region";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAppRuntime } from "../runtime";
import { usePowerSyncBoot } from "./use-power-sync-boot";

interface ReadyPowerSyncBoundaryProps {
  apiClient: ApiClient;
  authClient: AuthClient;
  children: ReactNode;
  manifest: RegionManifest;
}

export function PowerSyncBoundary({ children }: { children: ReactNode }) {
  const { apiClient, authClient, manifest } = useRegionClients();
  if (!authClient || !apiClient || !manifest) {
    return <LoaderView />;
  }

  return (
    <ReadyPowerSyncBoundary
      apiClient={apiClient}
      authClient={authClient}
      manifest={manifest}
    >
      {children}
    </ReadyPowerSyncBoundary>
  );
}

function ReadyPowerSyncBoundary({
  apiClient,
  authClient,
  children,
  manifest,
}: ReadyPowerSyncBoundaryProps) {
  return (
    <ApiProvider client={apiClient}>
      <EntitledPowerSyncBoundary
        authClient={authClient}
        manifest={manifest}
      >
        {children}
      </EntitledPowerSyncBoundary>
    </ApiProvider>
  );
}

function EntitledPowerSyncBoundary({
  authClient,
  children,
  manifest,
}: Omit<ReadyPowerSyncBoundaryProps, "apiClient">) {
  const { t } = useTranslation();
  const { createPowerSyncSession, localContentBridge: LocalContentBridge } =
    useAppRuntime();
  const { data: session } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const userId = session?.user?.id;
  const sessionId = session?.session?.id;
  const isAnonymous = session?.user?.isAnonymous ?? true;
  const apiUrl = manifest.apiUrl;

  const syncAccess = resolveSyncAccess({
    isAnonymous,
  });

  const { boot, error: bootError, retry } = usePowerSyncBoot({
    apiUrl,
    createPowerSyncSession,
    organizationId: activeOrganization?.id,
    regionId: manifest.regionId,
    sessionId,
    userId,
  });

  if (isOfflineEncryptionKeyError(bootError)) {
    return (
      <PanelError
        actions={
          <Button onClick={retry}>{t("common.retry")}</Button>
        }
        description={t("errors.offlineUnlock.desc")}
        icon={CloudOffIcon}
        title={t("errors.offlineUnlock.title")}
      />
    );
  }
  if (bootError) throw bootError;
  if (!boot) return <LoaderView />;

  return (
    <PowerSyncProvider
      session={boot.session}
      syncAccess={syncAccess}
      syncBlocker={boot.syncBlocker}
    >
      <EntitlementsProvider>{children}</EntitlementsProvider>
      {LocalContentBridge ? <LocalContentBridge /> : null}
      <DebugLoggingSync />
    </PowerSyncProvider>
  );
}
