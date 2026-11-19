import {
  type ResourceTypeDefinition,
  useResourceTypes,
} from "@lunarisapp/plugin-sdk";
import { useMemo } from "react";

const pickerPriority = new Map([
  ["lunaris.rich-text", 0],
  ["lunaris.kanban", 1],
  ["lunaris.file", 2],
]);
const byName = new Intl.Collator(undefined, { sensitivity: "base" });

/** Returns user-creatable resource types in picker order. */
export function useAvailableResources(): ResourceTypeDefinition[] {
  const resources = useResourceTypes();
  return useMemo(
    () =>
      resources
        .filter((resource) => resource.hierarchy?.userCreatable !== false)
        .sort((left, right) => {
          const leftRank =
            pickerPriority.get(left.resourceTypeId) ?? pickerPriority.size;
          const rightRank =
            pickerPriority.get(right.resourceTypeId) ?? pickerPriority.size;
          return leftRank - rightRank || byName.compare(left.name, right.name);
        }),
    [resources]
  );
}
