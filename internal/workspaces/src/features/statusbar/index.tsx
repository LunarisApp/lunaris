import { useResourceType, useView } from "@lunarisapp/plugin-sdk";
import type { ResourceStorageHandles, ResourceViewDefinition } from "@lunarisapp/plugin-sdk";
import { useResourceStorageSlots } from "@repo/data/features/workspace-storage-slots";
import { cn } from "@lunarisapp/ui/lib/utils";
import { createElement, type HTMLAttributes } from "react";
import { useGridLayoutStore } from "../grid-layout/context";

export function Statusbar({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={cn(
        "h-8 flex justify-between items-center px-2.5 text-muted-foreground text-xs",
        className
      )}
      {...props}
    />
  );
}

function StatusbarSection({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-1 min-w-0 items-center gap-3", className)}
      {...props}
    />
  );
}

Statusbar.Leading = function StatusbarLeading({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <StatusbarSection className={cn("justify-start", className)} {...props} />
  );
};

Statusbar.Trailing = function StatusbarTrailing({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <StatusbarSection className={cn("justify-end", className)} {...props} />
  );
};

Statusbar.Middle = function StatusbarMiddle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <StatusbarSection className={cn("justify-center", className)} {...props} />
  );
};

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

export function ActiveResourceStatusBar() {
  const activePanelId = useGridLayoutStore((state) => state.activePanelId);
  const panels = useGridLayoutStore((state) => state.panels);
  const activePanel = panels.find((panel) => panel.id === activePanelId);
  const view = useView(activePanel?.renderer ?? "")?.definition;
  const resourceTypeId = stringParam(activePanel?.params?.resourceTypeId);
  const definition = useResourceType(resourceTypeId ?? "");
  const resourceId = stringParam(activePanel?.params?.resourceId);
  const slots = useResourceStorageSlots(resourceId ?? "");
  const storage = Object.fromEntries(
    slots.data
      .filter((slot) => slot.name && slot.kind)
      .map((slot) => [slot.name!, { kind: slot.kind!, storageId: slot.id }]),
  ) as ResourceStorageHandles;

  const resource =
    definition && resourceId
      ? {
          parentId: stringParam(activePanel?.params?.parentId) ?? null,
          resourceId,
          resourceTypeId: definition.resourceTypeId,
          schemaId: definition.schema.id,
          schemaVersion:
            positiveInteger(activePanel?.params?.schemaVersion) ??
            definition.schema.currentVersion,
        }
      : undefined;
  if (!resource || !view?.statusBar) {
    return null;
  }

  const requirements =
    (view as ResourceViewDefinition).storageRequirements ?? {};
  if (Object.entries(requirements).some(([name, kind]) => storage[name]?.kind !== kind)) {
    return null;
  }
  return createElement(view.statusBar, {
    params: activePanel?.params ?? {},
    resource,
    storage: Object.fromEntries(
      Object.keys(requirements).map((name) => [name, storage[name]]),
    ) as ResourceStorageHandles,
  });
}
