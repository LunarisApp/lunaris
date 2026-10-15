"use client";

import { useResourceTypes } from "@lunarisapp/plugin-sdk";
import { usePluginSdkRuntime } from "@lunarisapp/plugin-sdk/internal";
import { useMemo } from "react";
import type { SearchResourceTypeMetadata } from "../resources";

export function useSearchResourceTypes(): ReadonlyMap<
  string,
  SearchResourceTypeMetadata
> {
  const runtime = usePluginSdkRuntime();
  const resourceTypes = useResourceTypes();

  return useMemo(
    () =>
      new Map(
        resourceTypes.flatMap((definition) => {
          const registration = runtime.contributions.getResourceType(
            definition.resourceTypeId,
          );
          return registration
            ? [
                [
                  definition.resourceTypeId,
                  {
                    extensionId: registration.extensionId,
                    name: definition.name,
                  },
                ] as const,
              ]
            : [];
        }),
      ),
    [resourceTypes, runtime.contributions],
  );
}
