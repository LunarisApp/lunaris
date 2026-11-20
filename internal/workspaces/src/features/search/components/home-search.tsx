import { useSearchAgentPrompt } from "../hooks/useSearchAgentPrompt";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { log, parseError } from "evlog";
import { ExtensionHostProvider } from "../../../extensions/host";
import { usePluginRuntimeHost } from "../../../extensions/host/plugin-runtime-host";
import { useOrganizationPluginRuntime } from "../../../extensions/organization-runtime";
import type { CommandActions } from "../command-results";
import { SearchProvider, useSearchDialogStore } from "../hooks/useSearchDialog";
import { SearchDialogMenu } from "./search-dialog";

const ignoreRenderer = () => undefined;

/** Load indexer declarations on demand, without mounting workspace chrome. */
function HomeSearchRuntime({
  commandActions,
  organizationId,
  userId,
  onReadyChange,
}: {
  commandActions: CommandActions;
  organizationId: string;
  userId?: string;
  onReadyChange: (ready: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const registry = useOrganizationPluginRuntime();
  const searching = useSearchDialogStore(
    (state) => state.isOpen && Boolean(state.query.trim())
  );
  const [activated, setActivated] = useState(false);
  const { reconcile, dispose } = usePluginRuntimeHost({
    i18n,
    loadPlugin: registry.loadPlugin,
    registerRenderers: ignoreRenderer,
    unregisterRenderer: ignoreRenderer,
    resourceViewLayoutWrapper: undefined,
  });

  useEffect(() => {
    if (searching) {
      setActivated(true);
    }
  }, [searching]);

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

  const askAgent = useSearchAgentPrompt(organizationId, userId);

  return (
    <SearchDialogMenu
      inline
      commandActions={commandActions}
      onAskAgent={askAgent}
    />
  );
}

function HomeSearchContent({
  organizationId,
  userId,
  commandActions,
}: {
  organizationId: string;
  userId?: string;
  commandActions: CommandActions;
}) {
  const [ready, setReady] = useState(false);
  return (
    <SearchProvider
      inline
      indexingReady={ready}
      organizationId={organizationId}
    >
      <HomeSearchRuntime
        userId={userId}
        organizationId={organizationId}
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
