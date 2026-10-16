import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { log, parseError } from "evlog";
import { ExtensionHostProvider } from "../../../extensions/host";
import { usePluginRuntimeHost } from "../../../extensions/host/plugin-runtime-host";
import { useOrganizationPluginRuntime } from "../../../extensions/organization-runtime";
import type { CommandActions } from "../command-results";
import { SearchProvider, useSearchDialog } from "../hooks/useSearchDialog";
import { SearchDialogMenu } from "./search-dialog";

const ignoreRenderer = () => undefined;

/** Load indexer declarations on demand, without mounting workspace chrome. */
function HomeSearchRuntime({
  commandActions,
  onReadyChange,
}: {
  commandActions: CommandActions;
  onReadyChange: (ready: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const registry = useOrganizationPluginRuntime();
  const { isOpen } = useSearchDialog();
  const [activated, setActivated] = useState(false);
  const { reconcile, dispose } = usePluginRuntimeHost({
    i18n,
    loadPlugin: registry.loadPlugin,
    registerRenderers: ignoreRenderer,
    unregisterRenderer: ignoreRenderer,
    resourceViewLayoutWrapper: undefined,
  });

  useEffect(() => {
    if (isOpen) {
      setActivated(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!activated) {
      return;
    }
    let cancelled = false;
    onReadyChange(false);
    void reconcile({
      enabledExtensionIds: registry.allExtensionIds,
      extensionAvailability: registry.extensionAvailability,
      runtimeRevisions: registry.runtimeRevisions,
    })
      .then((errors) => {
        if (cancelled) {
          return;
        }
        for (const [extensionId, error] of Object.entries(errors)) {
          if (error) {
            log.warn({
              tag: "Search",
              msg: "search extension unavailable",
              extensionId,
              error: parseError(error),
            });
          }
        }
        onReadyChange(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          log.warn({
            tag: "Search",
            msg: "search extensions failed to initialize",
            error: parseError(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activated,
    onReadyChange,
    reconcile,
    registry.allExtensionIds,
    registry.extensionAvailability,
    registry.runtimeRevisions,
  ]);

  useEffect(() => dispose, [dispose]);

  return <SearchDialogMenu commandActions={commandActions} />;
}

function HomeSearchContent({
  children,
  organizationId,
  commandActions,
}: {
  children: ReactNode;
  organizationId: string;
  commandActions: CommandActions;
}) {
  const [ready, setReady] = useState(false);
  return (
    <SearchProvider indexingReady={ready} organizationId={organizationId}>
      {children}
      <HomeSearchRuntime
        commandActions={commandActions}
        onReadyChange={setReady}
      />
    </SearchProvider>
  );
}

export function HomeSearchProvider(
  props: Parameters<typeof HomeSearchContent>[0]
) {
  return (
    <ExtensionHostProvider key={props.organizationId}>
      <HomeSearchContent {...props} />
    </ExtensionHostProvider>
  );
}
