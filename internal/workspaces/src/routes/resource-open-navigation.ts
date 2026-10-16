import {
  type ResourceOpenKind,
  hasPendingResourceOpen,
  reportResourceOpenFailure,
  reportResourceOpenReady,
  startResourceOpen,
  startResourceOpenStage,
} from "../extensions/host";
import { isResourceViewReady } from "../extensions/host/resource-view-readiness";

interface ExistingResourceView {
  isUnloaded: boolean;
}

interface PrepareResourceOpenInput {
  existingPanel?: ExistingResourceView;
  preloadRenderer?: () => Promise<void>;
  requestedOpenKind?: "deep_link";
  resourceId: string;
  resourceTypeId: string;
}

export function resolveResourceOpenKind(
  requestedOpenKind: "deep_link" | undefined,
  existingPanel: ExistingResourceView | undefined
): ResourceOpenKind {
  if (requestedOpenKind) {
    return requestedOpenKind;
  }
  if (!existingPanel) {
    return "new";
  }
  return existingPanel.isUnloaded ? "unloaded" : "loaded";
}

export function prepareResourceOpen({
  existingPanel,
  resourceId,
  resourceTypeId,
  preloadRenderer,
  requestedOpenKind,
}: PrepareResourceOpenInput): ResourceOpenKind {
  const openKind = resolveResourceOpenKind(requestedOpenKind, existingPanel);
  startResourceOpen({
    cacheOutcome: openKind === "loaded" ? "loaded" : undefined,
    resourceId,
    openKind,
    resourceTypeId,
  });
  if (preloadRenderer) {
    const complete = startResourceOpenStage(resourceId, "module");
    void preloadRenderer()
      .then(complete)
      .catch(() => {
        complete();
        reportResourceOpenFailure(resourceId, "module");
      });
  }
  return openKind;
}

/** Native tab activation also opens resources, without going through navigation. */
export function trackResourceViewActivation({
  resourceId,
  resourceTypeId,
  preloadRenderer,
}: Pick<
  PrepareResourceOpenInput,
  "resourceId" | "resourceTypeId" | "preloadRenderer"
>): void {
  // Tree/search navigation starts before Dockview emits activation.
  if (hasPendingResourceOpen(resourceId)) {
    return;
  }
  const ready = isResourceViewReady(resourceId);
  prepareResourceOpen({
    resourceId,
    resourceTypeId,
    preloadRenderer,
    existingPanel: { isUnloaded: !ready },
  });
  if (ready) {
    reportResourceOpenReady(resourceId);
  }
}
