import { GridLayoutPanel } from "../../features/grid-layout/panel";
import { ResourcePresenceBoundary } from "./resource-presence";
import type {
  ResourceTypeDefinition,
  ResourceEnvelope,
  ResourceResolution,
  ResourceStorageHandles,
  ResourceViewDefinition,
  ViewDefinition,
} from "@lunarisapp/plugin-sdk";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import { usePowerSync } from "@repo/data/core";
import { useResourceStorageSlots } from "@repo/data/features/workspace-storage-slots";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import {
  createElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  markResourceOpenPanelMounted,
  reportResourceOpenReady,
  startResourceOpenStage,
} from "./resource-open-performance";
import { resolveHostResource } from "./resource-resolution";
import {
  markResourceViewReady,
  releaseResourceViewReady,
} from "./resource-view-readiness";

interface DockviewPanelProps {
  api?: {
    isVisible: boolean;
    onDidVisibilityChange: (listener: () => void) => { dispose: () => void };
  };
  params: Record<string, unknown>;
}

type GridLayoutRegister = (
  extensionId: string,
  viewId: string,
  builder: (props: DockviewPanelProps) => ReactNode,
) => void;

export interface ResourceLayoutWrapperProps {
  children: ReactNode;
  resource: ResourceEnvelope;
  storage: ResourceStorageHandles;
}

export type ResourceLayoutWrapper = (
  props: ResourceLayoutWrapperProps,
) => ReactNode;

export interface RegisterResourceViewOptions {
  layoutWrapper?: ResourceLayoutWrapper;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function ResourcePanelMountMarker({
  children,
  dataReady,
  resourceId,
}: {
  children?: ReactNode;
  dataReady: boolean;
  resourceId: string;
}) {
  useLayoutEffect(() => {
    markResourceOpenPanelMounted(resourceId, dataReady);
  }, [dataReady, resourceId]);
  return children;
}

function ResourceQuarantine({
  diagnostic,
  onRetry,
  retryable,
}: {
  diagnostic: string;
  onRetry: () => void;
  retryable: boolean;
}) {
  return createElement(
    "div",
    { className: "flex h-full items-center justify-center p-6", role: "alert" },
    createElement(
      "div",
      { className: "max-w-md space-y-3 rounded-lg border bg-background p-5" },
      createElement("h2", { className: "font-semibold" }, "Resource unavailable"),
      createElement("p", { className: "text-sm text-muted-foreground" }, diagnostic),
      retryable
        ? createElement(
            "button",
            {
              className: "rounded-md border px-3 py-1.5 text-sm",
              onClick: onRetry,
              type: "button",
            },
            "Retry",
          )
        : null,
    ),
  );
}

function ResourceLoading() {
  return createElement(
    "div",
    {
      "aria-busy": true,
      "aria-label": "Loading resource",
      className: "flex h-full items-center justify-center bg-background",
      role: "status",
    },
    createElement(Spinner, {
      "aria-hidden": true,
      className: "size-6",
      role: "presentation",
    }),
    createElement("span", { className: "sr-only" }, "Loading resource"),
  );
}

function ResourceResolutionGate({
  definition,
  isVisible,
  layoutWrapper,
  params,
  renderer,
  resource,
  storageRequirements,
}: {
  definition: ResourceTypeDefinition;
  isVisible: boolean;
  layoutWrapper?: ResourceLayoutWrapper;
  params: Record<string, unknown>;
  renderer: ResourceViewDefinition["renderer"];
  resource: ResourceEnvelope;
  storageRequirements: ResourceViewDefinition["storageRequirements"];
}) {
  const db = usePowerSync();
  const { workspaceId } = useCurrentWorkspace();
  const slots = useResourceStorageSlots(resource.resourceId);
  const storage = useMemo(
    () =>
      Object.fromEntries(
        slots.data.map((slot) => [
          slot.name,
          { kind: slot.kind, storageId: slot.id },
        ]),
      ) as ResourceStorageHandles,
    [slots.data],
  );
  const storageIdentity = JSON.stringify(
    slots.data.map((slot) => [
      slot.id,
      slot.name,
      slot.kind,
      slot.backing_id,
    ]),
  );
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const [attempt, setAttempt] = useState(0);
  const resolutionKey = JSON.stringify([
    attempt,
    workspaceId,
    resource.parentId,
    resource.resourceId,
    resource.resourceTypeId,
    resource.schemaId,
    resource.schemaVersion,
    storageIdentity,
  ]);
  const [resolution, setResolution] = useState<{
    definition: ResourceTypeDefinition;
    key: string;
    value: ResourceResolution;
  } | null>(null);
  const currentResolution =
    resolution?.definition === definition && resolution.key === resolutionKey
      ? resolution.value
      : null;

  const [readinessOwner] = useState(() => Symbol());
  useLayoutEffect(
    () => () => {
      releaseResourceViewReady(resource.resourceId, readinessOwner);
    },
    [resource.resourceId, readinessOwner, resolutionKey, definition]
  );

  useEffect(() => {
    if (slots.isLoading) return;
    const currentStorage = storageRef.current;
    for (const [name, kind] of Object.entries(definition.storage)) {
      if (currentStorage[name]?.kind !== kind.kind) {
        if (resource.schemaVersion < definition.schema.currentVersion) continue;
        setResolution({
          definition,
          key: resolutionKey,
          value: {
            diagnostic: `Storage slot ${name}:${kind.kind} is unavailable`,
            envelope: resource,
            retryable: true,
            status: "quarantined",
          },
        });
        return;
      }
    }
    for (const [name, kind] of Object.entries(storageRequirements)) {
      if (currentStorage[name]?.kind !== kind) {
        setResolution({
          definition,
          key: resolutionKey,
          value: {
            diagnostic: `View requires storage slot ${name}:${kind}`,
            envelope: resource,
            retryable: false,
            status: "quarantined",
          },
        });
        return;
      }
    }

    let cancelled = false;
    const completeResolution = startResourceOpenStage(
      resource.resourceId,
      "resolution"
    );
    void resolveHostResource({
      db,
      definition,
      envelope: resource,
      workspaceId,
    }).then((next) => {
      if (!cancelled) {
        completeResolution();
        setResolution({ definition, key: resolutionKey, value: next });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    db,
    definition,
    workspaceId,
    resolutionKey,
    resource.resourceId,
    resource.schemaVersion,
    slots.isLoading,
  ]);

  if (!currentResolution) return createElement(ResourceLoading);
  if (currentResolution.status === "quarantined") {
    return createElement(ResourceQuarantine, {
      diagnostic: currentResolution.diagnostic,
      onRetry: () => setAttempt((value) => value + 1),
      retryable: currentResolution.retryable,
    });
  }

  if (Object.entries(storageRequirements).some(
    ([name, kind]) => storage[name]?.kind !== kind,
  )) return null;

  const resolvedResource = currentResolution.envelope;
  const rendered = createElement(renderer, {
    params,
    isVisible,
    reportReady: () => {
      markResourceViewReady(resource.resourceId, readinessOwner);
      markResourceOpenPanelMounted(
        resource.resourceId,
        !Object.values(storage).some((slot) => slot.kind === "yjs"),
      );
      reportResourceOpenReady(resource.resourceId);
    },
    resource: resolvedResource,
    storage: Object.fromEntries(
      Object.keys(storageRequirements).map((name) => [name, storage[name]]),
    ) as ResourceStorageHandles,
  });
  const content = createElement(
    ResourcePanelMountMarker,
    {
      dataReady: !Object.values(storage).some((slot) => slot.kind === "yjs"),
      resourceId: resource.resourceId,
    },
    createElement(GridLayoutPanel, { children: rendered }),
  );
  const wrapped = layoutWrapper
    ? createElement(layoutWrapper, {
        children: content,
        resource: resolvedResource,
        storage,
      })
    : content;
  return createElement(ResourcePresenceBoundary, { resourceId: resource.resourceId, isVisible, storage, children: wrapped });
}

export function registerResourceViewWithGridLayout(
  gridLayoutRegister: GridLayoutRegister,
  extensionId: string,
  viewDefinition: ViewDefinition,
  getResourceTypeDefinition: (
    resourceTypeId: string,
  ) => ResourceTypeDefinition | undefined,
  options?: RegisterResourceViewOptions,
): void {
  if (viewDefinition.target.kind !== "resource") {
    throw new Error(`View "${viewDefinition.viewId}" is not resource-targeted`);
  }
  const renderer = (viewDefinition as ResourceViewDefinition).renderer;
  const { layoutWrapper } = options ?? {};
  gridLayoutRegister(extensionId, viewDefinition.viewId, (props) => {
    const [isVisible, setIsVisible] = useState(props.api?.isVisible ?? true);
    useEffect(() => {
      setIsVisible(props.api?.isVisible ?? true);
      const subscription = props.api?.onDidVisibilityChange(() =>
        setIsVisible(props.api?.isVisible ?? true),
      );
      return () => subscription?.dispose();
    }, [props.api]);
    const resourceId = stringParam(props.params.resourceId);
    const resourceTypeId = stringParam(props.params.resourceTypeId);
    if (!resourceId || !resourceTypeId) return null;
    const resourceType = getResourceTypeDefinition(resourceTypeId);
    if (!resourceType) return null;
    const storageRequirements = (viewDefinition as ResourceViewDefinition).storageRequirements;
    if (Object.entries(storageRequirements).some(
      ([name, kind]) => resourceType.storage[name]?.kind !== kind,
    )) return null;
    const resource: ResourceEnvelope = {
      parentId: stringParam(props.params.parentId) ?? null,
      resourceId,
      resourceTypeId: resourceType.resourceTypeId,
      schemaId: resourceType.schema.id,
      schemaVersion:
        positiveInteger(props.params.schemaVersion) ??
        resourceType.schema.currentVersion,
    };
    return createElement(ResourceResolutionGate, {
      definition: resourceType,
      isVisible,
      layoutWrapper,
      params: props.params,
      renderer,
      resource,
      storageRequirements,
    });
  });
}
