import { useMemo } from "react";
import type { Doc } from "yjs";
import { useYArray } from "./hooks";
import {
  arePropertiesInitialized,
  effectivePropertyDefinitions,
  getPropertyDefinitions,
  orderPropertyMaps,
} from "./property-state";
import type { PropertyDefinition } from "./types";

function propertyRevisionKey(
  propertyMaps: Array<{ get(key: string): unknown }>
) {
  return JSON.stringify(
    propertyMaps.map((property) =>
      ["id", "name", "type", "options", "order"].map(
        (key) => property.get(key) ?? ""
      )
    )
  );
}

export function useProperties(yDoc: Doc) {
  const { items } = useYArray(yDoc, "properties");
  const propertyMaps = useMemo(() => orderPropertyMaps(items), [items]);
  const revisionKey = propertyRevisionKey(propertyMaps);
  const properties = useMemo<PropertyDefinition[]>(
    () =>
      effectivePropertyDefinitions(
        getPropertyDefinitions(propertyMaps),
        propertyMaps.length > 0 || arePropertiesInitialized(yDoc)
      ),
    [revisionKey, propertyMaps, yDoc]
  );

  return { properties, propertyMaps };
}
