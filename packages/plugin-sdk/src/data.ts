import { applyUpdateV2, Doc } from "yjs";
import type { PluginResourceReadContext } from "./resource-data";
import type { ResourceStorageHandle } from "./types";

export async function reconstructYjsDoc(
  context: PluginResourceReadContext,
  storage: ResourceStorageHandle
): Promise<Doc | null> {
  if (storage.kind !== "yjs") {
    throw new Error("Yjs storage required");
  }
  const updates = await context.getYjsStorageUpdates(storage);
  if (updates.length === 0) {
    return null;
  }

  const doc = new Doc();
  try {
    for (const { updateBase64 } of updates) {
      const update = Uint8Array.from(atob(updateBase64), (value) =>
        value.charCodeAt(0)
      );
      applyUpdateV2(doc, update);
    }
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

export async function withYjsDoc<T>(
  context: PluginResourceReadContext,
  storage: ResourceStorageHandle,
  operation: (doc: Doc) => T | Promise<T>,
  empty: T
): Promise<T> {
  const doc = await reconstructYjsDoc(context, storage);
  if (!doc) {
    return empty;
  }
  try {
    return await operation(doc);
  } finally {
    doc.destroy();
  }
}
