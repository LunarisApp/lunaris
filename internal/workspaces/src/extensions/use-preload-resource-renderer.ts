import { useResourceType, useView } from "@lunarisapp/plugin-sdk";
import { useEffect } from "react";
import { useResourceViewReady } from "./host/resource-view-readiness";

/** Uses only registered views, so unavailable or disabled extensions stay unloaded. */
export function usePreloadResourceRenderer(resourceTypeId: string | undefined) {
  const resourceType = useResourceType(resourceTypeId ?? "");
  const view = useView(resourceType?.defaultViewId ?? "");
  const preload = view?.definition.preload;
  useEffect(() => {
    if (resourceTypeId) {
      void preload?.().catch(() => undefined);
    }
  }, [preload, resourceTypeId]);
}

export function usePreloadRichTextRenderer(
  activeResourceId: string | undefined,
  enabled: boolean
) {
  const resourceType = useResourceType("lunaris.rich-text");
  const view = useView(resourceType?.defaultViewId ?? "");
  const preload = view?.definition.preload;
  const activeReady = useResourceViewReady(activeResourceId);

  useEffect(() => {
    if (!(enabled && preload) || (activeResourceId && !activeReady)) {
      return;
    }
    const run = () => {
      void preload().catch(() => undefined);
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 1000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [activeResourceId, activeReady, enabled, preload]);
}
