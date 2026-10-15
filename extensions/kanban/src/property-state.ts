import { Array as YArray, type Doc, Map as YMap, Map as YjsMap } from "yjs";
import {
  DEFAULT_STATUS_PROPERTY,
  KANBAN_META_MAP,
  PROPERTIES_INITIALIZED_KEY,
} from "./constants";
import {
  isChoiceProperty,
  parsePropertyDefinition,
} from "./property-codec";
import type { PropertyDefinition } from "./types";

export function arePropertiesInitialized(doc: Doc): boolean {
  return (
    doc.getMap<unknown>(KANBAN_META_MAP).get(PROPERTIES_INITIALIZED_KEY) ===
      true || doc.getArray("properties").length > 0
  );
}

export function markPropertiesInitialized(doc: Doc): void {
  const metadata = doc.getMap<unknown>(KANBAN_META_MAP);
  if (metadata.get(PROPERTIES_INITIALIZED_KEY) === true) return;
  metadata.set(PROPERTIES_INITIALIZED_KEY, true);
}

export function appendPropertyDefinition(
  properties: YArray<YMap<unknown>>,
  property: PropertyDefinition
): void {
  const value = new YjsMap<unknown>();
  value.set("id", property.id);
  value.set("name", property.name);
  value.set("type", property.type);
  if (isChoiceProperty(property)) {
    value.set("options", JSON.stringify(property.options));
  }
  properties.push([value]);
}

export function getEffectivePropertyDefinitions(
  doc: Doc
): PropertyDefinition[] {
  const properties = getPropertyDefinitions(
    doc.getArray<YMap<unknown>>("properties").toArray()
  );
  return effectivePropertyDefinitions(properties, arePropertiesInitialized(doc));
}

export function getPropertyDefinitions(
  maps: readonly ReadablePropertyMap[]
): PropertyDefinition[] {
  return orderPropertyMaps(maps)
    .map(parsePropertyDefinition)
    .filter((property) => property !== null);
}

export function effectivePropertyDefinitions(
  properties: PropertyDefinition[],
  initialized: boolean
): PropertyDefinition[] {
  return properties.length > 0 || initialized
    ? properties
    : [DEFAULT_STATUS_PROPERTY];
}

export function movePropertyDefinition(
  properties: YArray<YMap<string>>,
  fromIndex: number,
  toIndex: number
): void {
  const ordered = orderPropertyMaps(properties.toArray());
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex >= ordered.length
  ) {
    return;
  }

  const [source] = ordered.splice(fromIndex, 1);
  if (!source) return;
  ordered.splice(toIndex, 0, source);
  for (const [index, property] of ordered.entries()) {
    property.set("order", String(index));
  }
}

export function orderPropertyMaps<T extends ReadablePropertyMap>(
  properties: readonly T[]
): T[] {
  return properties
    .map((property, index) => ({
      index,
      order: propertyOrder(property.get("order"), index),
      property,
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ property }) => property);
}

function propertyOrder(value: unknown, fallback: number): number {
  const order = typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : value;
  return typeof order === "number" && Number.isSafeInteger(order) && order >= 0
    ? order
    : fallback;
}

interface ReadablePropertyMap {
  get(key: string): unknown;
}
