export const LUNARIS_RESOURCE_DND_MIME =
  "application/x-lunaris-workspace-resource";

export interface LunarisResourceDragEntry {
  resourceId: string;
  resourceTypeId: string;
  schemaVersion: number;
  title: string;
}

export interface LunarisResourceDragPayload {
  resources: LunarisResourceDragEntry[];
  v: 3;
}

export function encodeResourceDragPayload(
  payload: LunarisResourceDragPayload
): string {
  return JSON.stringify(payload);
}

export function decodeResourceDragPayload(
  raw: string
): LunarisResourceDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (value.v !== 3 || !Array.isArray(value.resources)) return null;

    const resources: LunarisResourceDragEntry[] = [];
    for (const rawResource of value.resources) {
      if (!rawResource || typeof rawResource !== "object") return null;
      const resource = rawResource as Record<string, unknown>;
      if (
        typeof resource.resourceId !== "string" ||
        resource.resourceId.length === 0 ||
        typeof resource.resourceTypeId !== "string" ||
        resource.resourceTypeId.length === 0 ||
        typeof resource.title !== "string" ||
        typeof resource.schemaVersion !== "number" ||
        !Number.isInteger(resource.schemaVersion) ||
        resource.schemaVersion < 1
      ) {
        return null;
      }
      resources.push({
        resourceId: resource.resourceId,
        resourceTypeId: resource.resourceTypeId,
        schemaVersion: resource.schemaVersion,
        title: resource.title,
      });
    }
    return { resources, v: 3 };
  } catch {
    return null;
  }
}

export function readResourceDragPayload(
  event: DragEvent
): LunarisResourceDragPayload | null {
  const raw = event.dataTransfer?.getData(LUNARIS_RESOURCE_DND_MIME);
  return raw ? decodeResourceDragPayload(raw) : null;
}
