export function decodePluginStorageValue<T>(
  raw: string | null | undefined
): T | null {
  if (raw == null) {
    return null;
  }
  return JSON.parse(raw) as T;
}

export function encodePluginStorageValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Extension storage values must be JSON-serializable");
  }
  return serialized;
}
