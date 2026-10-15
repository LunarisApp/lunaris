import type { PluginResourcesMap } from "@lunarisapp/plugin-sdk";

export function getResourceName(
  resourcesMap: PluginResourcesMap,
  resourceId: string
) {
  return resourcesMap.get(resourceId)?.name ?? "";
}
