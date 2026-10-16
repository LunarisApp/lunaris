import type {
  JsonValue,
  PluginStoredFileMetadata,
  ResourcePayloadStorage,
  ResourceStorageHandles,
} from "@lunarisapp/plugin-sdk";
import { Doc } from "yjs";
import type { Database, DatabaseOrTx } from "../../core/utils";
import { applyYjsDocumentUpdates, getYjsDocumentUpdates } from "../yjs";
import {
  preloadYjsDocument,
  yjsDocumentResourceStore,
} from "../yjs/document-resource-store";
import { getResourceStorageSlots, getStorageValues } from "./services";
import type { WorkspaceStorageSlotEntity } from "./table";

export interface HydratedResourceStorage {
  dispose: () => void;
  handles: ResourceStorageHandles;
  slots: WorkspaceStorageSlotEntity[];
  storage: Record<string, ResourcePayloadStorage>;
}

interface HydrateResourceStorageOptions {
  sharedYjsWorkspaceId?: string;
}

interface HydratedSlot {
  dispose?: () => void;
  storage: ResourcePayloadStorage;
}

interface SharedYjsHydration {
  database: Database;
  workspaceId: string;
}

function parseValue(value: string | null): JsonValue {
  if (value == null) {
    return null;
  }
  return JSON.parse(value) as JsonValue;
}

async function hydrateSlot(
  db: DatabaseOrTx,
  slot: WorkspaceStorageSlotEntity,
  sharedYjs: SharedYjsHydration | undefined
): Promise<HydratedSlot> {
  if (slot.kind === "file") {
    return {
      storage: {
        kind: "file",
        metadata: slot.metadata
          ? (JSON.parse(slot.metadata) as PluginStoredFileMetadata)
          : null,
      },
    };
  }
  if (slot.kind === "key-value") {
    return {
      storage: {
        kind: "key-value",
        values: Object.fromEntries(
          (await getStorageValues(db, slot.id)).map((row) => [
            row.key ?? "",
            parseValue(row.value),
          ])
        ),
      },
    };
  }
  if (slot.kind !== "yjs") {
    throw new Error("Storage slot has an invalid kind");
  }
  if (!slot.backing_id) {
    throw new Error(`Yjs storage ${slot.name} has no backing document`);
  }
  if (sharedYjs) {
    const handle = preloadYjsDocument({
      db: sharedYjs.database,
      documentId: slot.backing_id,
      priority: "intent",
      workspaceId: sharedYjs.workspaceId,
    });
    try {
      await handle.done;
      const resource = yjsDocumentResourceStore.get(
        sharedYjs.database,
        slot.backing_id,
        sharedYjs.workspaceId
      );
      if (resource?.status !== "ready") {
        throw new Error(`Yjs storage ${slot.name} did not become ready`);
      }
      return {
        dispose: handle.release,
        storage: { document: resource.doc, kind: "yjs" },
      };
    } catch (error) {
      handle.release();
      throw error;
    }
  }
  const document = new Doc();
  try {
    applyYjsDocumentUpdates(
      document,
      await getYjsDocumentUpdates(db, slot.backing_id)
    );
    return {
      dispose: () => document.destroy(),
      storage: { document, kind: "yjs" },
    };
  } catch (error) {
    document.destroy();
    throw error;
  }
}

function resolveSharedYjsHydration(
  db: DatabaseOrTx,
  workspaceId: string | undefined
): SharedYjsHydration | undefined {
  if (!workspaceId) {
    return undefined;
  }
  if (!("writeTransaction" in db)) {
    throw new Error("Shared Yjs hydration requires a database");
  }
  return { database: db, workspaceId };
}

export async function hydrateResourceStorage(
  db: DatabaseOrTx,
  resourceId: string,
  options: HydrateResourceStorageOptions = {}
): Promise<HydratedResourceStorage> {
  const handles: Record<string, ResourceStorageHandles[string]> = {};
  const storage: Record<string, ResourcePayloadStorage> = {};
  const disposers: Array<() => void> = [];
  const sharedYjs = resolveSharedYjsHydration(db, options.sharedYjsWorkspaceId);
  const slots = await getResourceStorageSlots(db, resourceId);
  try {
    for (const slot of slots) {
      if (!slot.name) {
        throw new Error("Storage slot has no name");
      }
      const entry = await hydrateSlot(db, slot, sharedYjs);
      if (entry.dispose) {
        disposers.push(entry.dispose);
      }
      handles[slot.name] = { kind: entry.storage.kind, storageId: slot.id };
      storage[slot.name] = entry.storage;
    }
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        for (const dispose of disposers.reverse()) {
          dispose();
        }
      },
      handles,
      slots,
      storage,
    };
  } catch (error) {
    for (const dispose of disposers.reverse()) {
      dispose();
    }
    throw error;
  }
}
