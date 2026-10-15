"use client";

import { usePreloadResourceRenderer } from "../../../extensions/use-preload-resource-renderer";
import { useResourceTypes } from "@lunarisapp/plugin-sdk";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { WorkspaceResourceEntity } from "@repo/data/features/workspace-resources";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOrganizationNavigation } from "../../organization-navigation";
import { useWorkspaceResourcesMap } from "../store";
import { getAncestorPath } from "../utils";
import { WorkspaceResourceIcon } from "./workspace-tree-item-content";

interface WorkspaceTreeFlatListProps {
  activeIndex: number;
  className?: string;
  listId?: string;
  onActiveIndexChange?: (index: number) => void;
  results: WorkspaceResourceEntity[];
}

export function WorkspaceTreeFlatList({
  results,
  className,
  activeIndex,
  onActiveIndexChange,
  listId,
}: WorkspaceTreeFlatListProps) {
  const { t } = useTranslation();
  const { openResource } = useOrganizationNavigation();
  const resourceTypes = useResourceTypes();
  usePreloadResourceRenderer(
    results[activeIndex]?.resource_type_id ?? undefined
  );
  const resourcesMap = useWorkspaceResourcesMap();
  const isMobile = useIsMobile();

  const resourceMap = useMemo(
    () =>
      new Map(
        resourceTypes.map((resourceType) => [
          resourceType.resourceTypeId,
          resourceType,
        ]),
      ),
    [resourceTypes]
  );

  const untitledLabel = t("common.untitled");

  const folderPaths = useMemo(() => {
    const paths = new Map<string, string>();
    for (const item of results) {
      const ancestors = getAncestorPath(resourcesMap, item.id).slice(0, -1);
      const segments = ancestors.map(
        ({ item: ancestor }) => ancestor.name || untitledLabel
      );
      paths.set(
        item.id,
        segments.length === 0 ? "/" : `/ ${segments.join(" / ")}`
      );
    }
    return paths;
  }, [results, resourcesMap, untitledLabel]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const estimateSize = isMobile ? 64 : 52;
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 16,
  });

  // Re-measure rows when the row height estimate changes (breakpoint cross).
  useEffect(() => {
    virtualizer.measure();
  }, [estimateSize, virtualizer]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= results.length) return;
    virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, results.length, virtualizer]);

  // Hover updates activeIndex only on real pointer movement. This prevents the
  // classic virtualization bug where arrow-key scrolling repositions rows under
  // a stationary cursor and synthetic mouseenter events clobber selection.
  const pointerMovedRef = useRef(false);
  useEffect(() => {
    const clear = () => {
      pointerMovedRef.current = false;
    };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);

  const rowPadding = isMobile ? "px-3 py-2.5" : "px-2 py-1.5";

  if (results.length === 0) {
    return (
      <div
        className={cn("flex-1 min-h-0 overflow-y-auto", className)}
        ref={scrollRef}
      >
        <ul
          aria-label={t("explorer.searchResults")}
          className="h-full flex items-center justify-center px-4 py-6 text-center text-sm text-muted-foreground"
          id={listId}
          role="listbox"
        >
          <li aria-live="polite" className="list-none">
            {t("explorer.searchNoResults")}
          </li>
        </ul>
      </div>
    );
  }

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={cn("flex-1 min-h-0 overflow-y-auto", className)}
      ref={scrollRef}
    >
      <ul
        aria-label={t("explorer.searchResults")}
        className="relative px-2 pt-2"
        id={listId}
        role="listbox"
        style={{ height: `${totalSize}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const item = results[virtualRow.index];
          if (!item) return null;
          const resource = item.resource_type_id
            ? resourceMap.get(item.resource_type_id)
            : undefined;
          const name = item.name || untitledLabel;
          const path = folderPaths.get(item.id) ?? "";
          const isActive = virtualRow.index === activeIndex;

          return (
            <li
              aria-selected={isActive}
              className="absolute top-0 left-0 w-full px-2"
              data-active={isActive || undefined}
              id={listId ? `${listId}-option-${virtualRow.index}` : undefined}
              key={item.id}
              role="option"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                height: `${virtualRow.size}px`,
              }}
            >
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0",
                  rowPadding,
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "bg-background"
                )}
                onClick={() => {
                  if (!item.resource_type_id) return;
                  onActiveIndexChange?.(virtualRow.index);
                  openResource({
                    resourceId: item.id,
                    resourceTypeId: item.resource_type_id,
                    title: name,
                    parentId: item.parent_id ?? null,
                    schemaVersion: item.schema_version ?? 1,
                  });
                }}
                onPointerEnter={() => {
                  if (pointerMovedRef.current) {
                    onActiveIndexChange?.(virtualRow.index);
                  }
                }}
                onPointerMove={() => {
                  pointerMovedRef.current = true;
                  onActiveIndexChange?.(virtualRow.index);
                }}
                type="button"
              >
                <WorkspaceResourceIcon
                  className="size-4"
                  item={item}
                  resourceIcon={resource?.icon}
                />
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="truncate">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {path}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
