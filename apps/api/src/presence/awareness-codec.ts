import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { z } from "zod";

const position = z.object({
  type: z
    .object({
      client: z.number().int().nonnegative(),
      clock: z.number().int().nonnegative(),
    })
    .optional()
    .nullable(),
  tname: z.string().max(128).optional().nullable(),
  item: z
    .object({
      client: z.number().int().nonnegative(),
      clock: z.number().int().nonnegative(),
    })
    .optional()
    .nullable(),
  assoc: z.number().int().optional(),
});
const stateSchema = z.object({
  cursor: z.object({ anchor: position, head: position }).nullable().optional(),
  user: z.unknown().optional(),
});

export interface PresenceUser {
  color: string;
  id: string;
  image: string;
  name: string;
}
export interface AwarenessEntry {
  clientId: number;
  clock: number;
  state: {
    cursor?: z.infer<typeof stateSchema>["cursor"];
    data?: unknown;
    user: PresenceUser;
  } | null;
}

/** Accept only this connection's entry. Identity is always supplied by the server. */
export function readOwnedAwareness(
  data: Uint8Array,
  clientId: number,
  user: PresenceUser,
  kind: "resource" | "channel" | "yjs" = "yjs"
): AwarenessEntry {
  if (data.byteLength > 8192) {
    throw new Error("Presence message too large");
  }
  const decoder = decoding.createDecoder(data);
  if (decoding.readVarUint(decoder) !== 1) {
    throw new Error("Expected one awareness entry");
  }
  const receivedId = decoding.readVarUint(decoder);
  const clock = decoding.readVarUint(decoder);
  if (receivedId !== clientId || !Number.isSafeInteger(clock)) {
    throw new Error("Invalid awareness owner");
  }
  const raw: unknown = JSON.parse(decoding.readVarString(decoder));
  if (decoding.hasContent(decoder)) {
    throw new Error("Trailing awareness data");
  }
  let state: AwarenessEntry["state"] = null;
  if (raw !== null) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid presence state");
    }
    if (kind === "yjs") {
      state = { ...stateSchema.parse(raw), user };
    } else if (kind === "resource") {
      state = { user };
    } else {
      const data = (raw as { data?: unknown }).data ?? null;
      const validate = (value: unknown, depth: number): void => {
        if (depth > 8) {
          throw new Error("Presence state too deep");
        }
        if (typeof value === "number" && !Number.isFinite(value)) {
          throw new Error("Invalid JSON number");
        }
        if (value && typeof value === "object") {
          for (const child of Object.values(value)) {
            validate(child, depth + 1);
          }
        }
      };
      validate(data, 0);
      if (Buffer.byteLength(JSON.stringify(data)) > 4096) {
        throw new Error("Presence state too large");
      }
      state = { data, user };
    }
  }
  return { clientId, clock, state };
}

export function encodeAwareness(entries: AwarenessEntry[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const entry of entries) {
    encoding.writeVarUint(encoder, entry.clientId);
    encoding.writeVarUint(encoder, entry.clock);
    encoding.writeVarString(encoder, JSON.stringify(entry.state));
  }
  return encoding.toUint8Array(encoder);
}
