import { type ResourceTypeDefinition, useResourceTypes } from "@lunarisapp/plugin-sdk";
import { useMemo } from "react";

/** Returns resource kinds users can add to the workspace. */
export function useAvailableResources(): ResourceTypeDefinition[] {
  const resources = useResourceTypes();
  return useMemo(
    () =>
      resources.filter((resource) => resource.hierarchy?.userCreatable !== false),
    [resources]
  );
}
