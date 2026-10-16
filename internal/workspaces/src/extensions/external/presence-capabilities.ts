import type { JsonValue, ResourceStorageHandles } from "@lunarisapp/plugin-sdk";
import type { AwarenessChannels } from "../host/awareness-channels";

/** Keep presence credentials behind the renderer-scoped bridge. */
export function assertNoPresenceTicketRequest(
  input: RequestInfo | URL,
  baseUrl: string
) {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    baseUrl
  );
  const path = decodeURIComponent(url.pathname);
  if (/\/presence(?:\/ticket)?\/?$/i.test(path)) {
    throw new Error("Presence transport is host-only");
  }
}

export function createPresenceCapabilities(
  channels: AwarenessChannels,
  extensionId: string,
  storage: ResourceStorageHandles,
  owned: Set<string>,
  reset: () => void
) {
  return {
    "presence.open": (
      id: string,
      input: { channel?: string; storageId?: string; clientId?: number }
    ) => {
      if (!input || typeof input !== "object") {
        throw new Error("Invalid presence subscription");
      }
      if (
        input.storageId !== undefined &&
        !Object.values(storage).some(
          (slot) => slot.kind === "yjs" && slot.storageId === input.storageId
        )
      ) {
        throw new Error("Presence storage scope mismatch");
      }
      if (owned.has(id)) {
        throw new Error("Duplicate presence subscription");
      }
      // Register before open emits a snapshot, but never remove an existing lease.
      owned.add(id);
      try {
        channels.open(id, extensionId, input);
      } catch (error) {
        owned.delete(id);
        throw error;
      }
    },
    "presence.reset": reset,
    "presence.close": (id: string) => {
      if (owned.delete(id)) {
        channels.close(id);
      }
    },
    "presence.update": (id: string, value: JsonValue | ArrayBuffer) => {
      if (!owned.has(id)) {
        throw new Error("Presence subscription scope mismatch");
      }
      channels.update(id, value);
    },
  };
}
