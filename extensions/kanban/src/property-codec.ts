import type {
  ChoicePropertyDefinition,
  ResourcePropertyValue,
  PropertyDefinition,
  PropertyOption,
  PropertyType,
  PropertyValue,
} from "./types";

export const PROPERTY_TYPES = [
  "select",
  "multi-select",
  "people",
  "resource",
  "date",
  "text",
  "number",
  "checkbox",
] as const satisfies readonly PropertyType[];

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RFC_3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isChoiceProperty(
  property: PropertyDefinition
): property is ChoicePropertyDefinition {
  return property.type === "select" || property.type === "multi-select";
}

export function parsePropertyDefinition(
  property: ReadablePropertyMap
): PropertyDefinition | null {
  const id = property.get("id");
  const name = property.get("name");
  if (typeof id !== "string" || !id || typeof name !== "string") return null;

  const type = normalizePropertyType(property.get("type"));
  if (!type) return null;
  if (type === "select" || type === "multi-select") {
    return { id, name, options: parsePropertyOptions(property.get("options")), type };
  }
  return { id, name, type };
}

export function normalizePropertyType(value: unknown): PropertyType | null {
  return PROPERTY_TYPES.includes(value as PropertyType)
    ? (value as PropertyType)
    : null;
}

export function parsePropertyOptions(value: unknown): PropertyOption[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isPropertyOption).map(({ color, id, name }) => ({
    color,
    id,
    name,
  }));
}

export function normalizePropertyValue(
  property: PropertyDefinition,
  value: unknown
): PropertyValue | undefined {
  switch (property.type) {
    case "select":
      return typeof value === "string" &&
        property.options.some((option) => option.id === value)
        ? value
        : undefined;
    case "multi-select":
      if (!Array.isArray(value)) return undefined;
      return uniqueStrings(value).filter((id) =>
        property.options.some((option) => option.id === id)
      );
    case "people":
      return Array.isArray(value) ? uniqueStrings(value) : undefined;
    case "resource":
      return parseResourcePropertyValue(value);
    case "date":
      return typeof value === "string" && isPropertyDate(value)
        ? value
        : undefined;
    case "text":
      return typeof value === "string" ? value : undefined;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
    case "checkbox":
      return typeof value === "boolean" ? value : undefined;
  }
}

export function hasPropertyValue(value: PropertyValue | undefined): boolean {
  if (value === undefined || value === "") return false;
  return !Array.isArray(value) || value.length > 0;
}

export function isPropertyDate(value: string): boolean {
  if (DATE_ONLY_PATTERN.test(value)) {
    return isValidCalendarDate(...value.split("-").map(Number));
  }
  const match = RFC_3339_PATTERN.exec(value);
  return (
    match !== null &&
    isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
    Number.isFinite(Date.parse(value))
  );
}

export function formatPropertyValue(
  property: PropertyDefinition,
  value: PropertyValue | undefined,
  options: {
    booleanFalse?: string;
    booleanTrue?: string;
    canonicalDates?: boolean;
    canonicalNumbers?: boolean;
    locale?: string;
    resolvePerson?: (id: string) => string;
  } = {}
): string {
  if (value === undefined) return "";
  switch (property.type) {
    case "select":
      return property.options.find((option) => option.id === value)?.name ?? "";
    case "multi-select":
      return Array.isArray(value)
        ? value
            .map((id) => property.options.find((option) => option.id === id)?.name)
            .filter((name): name is string => Boolean(name))
            .join(", ")
        : "";
    case "people":
      return Array.isArray(value)
        ? value.map((id) => options.resolvePerson?.(id) ?? id).join(", ")
        : "";
    case "resource":
      return isResourcePropertyValue(value) ? value.name : "";
    case "date":
      if (typeof value !== "string") return "";
      return options.canonicalDates
        ? canonicalPropertyDate(value)
        : formatPropertyDate(value, options.locale);
    case "text":
      return typeof value === "string" ? value : "";
    case "number":
      return typeof value === "number"
        ? options.canonicalNumbers
          ? String(value)
          : new Intl.NumberFormat(options.locale).format(value)
        : "";
    case "checkbox":
      return value === true
        ? (options.booleanTrue ?? "true")
        : (options.booleanFalse ?? "false");
  }
}

export function isResourcePropertyValue(
  value: unknown
): value is ResourcePropertyValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<ResourcePropertyValue>;
  return (
    typeof candidate.resourceId === "string" &&
    candidate.resourceId.length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    typeof candidate.resourceTypeId === "string" &&
    candidate.resourceTypeId.length > 0 &&
    typeof candidate.workspaceId === "string" &&
    candidate.workspaceId.length > 0 &&
    typeof candidate.workspaceName === "string"
  );
}

function parseResourcePropertyValue(
  value: unknown
): ResourcePropertyValue | undefined {
  if (!isResourcePropertyValue(value)) return undefined;
  return {
    resourceId: value.resourceId,
    name: value.name,
    resourceTypeId: value.resourceTypeId,
    workspaceId: value.workspaceId,
    workspaceName: value.workspaceName,
  };
}

export function formatPropertyDate(value: string, locale?: string): string {
  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(Date.UTC(year!, month! - 1, day))
    );
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function canonicalPropertyDate(value: string): string {
  return DATE_ONLY_PATTERN.test(value) ? value : new Date(value).toISOString();
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function isValidCalendarDate(year = 0, month = 0, day = 0): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isPropertyOption(value: unknown): value is PropertyOption {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PropertyOption).id === "string" &&
    typeof (value as PropertyOption).name === "string" &&
    typeof (value as PropertyOption).color === "string"
  );
}

interface ReadablePropertyMap {
  get(key: string): unknown;
}
