import type { YjsSyncCursor } from "./yjs-journal";
import {
  applyUpdateV2,
  encodeStateVector,
  encodeStateAsUpdateV2,
  mergeUpdatesV2,
  type Doc,
} from "yjs";
/** Coalesce host revisions while a state-vector request is in flight. Initial
 * hydration and reconnect use the same handshake; responses never replace local edits. */
export function createYjsReplicaSync(
  doc: Doc,
  fetchUpdate: (
    vector: ArrayBuffer,
    cursor?: YjsSyncCursor
  ) => Promise<unknown>,
  ready: () => void,
  failed: (error: Error) => void,
  upload?: (update: ArrayBuffer) => Promise<unknown>
) {
  let pending = false;
  let disposed = false;
  let running: Promise<void> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 1000;
  let cursor: YjsSyncCursor | undefined;
  // Keep exact unacknowledged events, including deletion-only updates. A later
  // successful upload must not acknowledge an earlier failed one.
  const unacknowledged = new Set<Uint8Array>();
  const changed = (update: Uint8Array, origin: unknown) => {
    if (origin !== "host") {
      unacknowledged.add(update);
    }
  };
  doc.on("updateV2", changed);
  const run = async () => {
    while (pending && !disposed) {
      pending = false;
      try {
        const vector = encodeStateVector(doc);
        const response = await fetchUpdate(
          Uint8Array.from(vector).buffer,
          cursor
        );
        const {
          update,
          stateVector,
          cursor: nextCursor,
        } = response as {
          update: ArrayBuffer;
          stateVector?: ArrayBuffer;
          cursor?: YjsSyncCursor;
        };
        if (disposed) {
          return;
        }
        if (
          !(update instanceof ArrayBuffer) ||
          (stateVector !== undefined &&
            !(stateVector instanceof ArrayBuffer)) ||
          (nextCursor !== undefined &&
            (!nextCursor ||
              typeof nextCursor.epoch !== "string" ||
              !Number.isSafeInteger(nextCursor.revision) ||
              nextCursor.revision < 0)) ||
          (stateVector === undefined &&
            (!(cursor && nextCursor) ||
              nextCursor.epoch !== cursor.epoch ||
              nextCursor.revision < cursor.revision))
        ) {
          throw new Error("Invalid Yjs synchronization response");
        }
        applyUpdateV2(doc, new Uint8Array(update), "host");
        const outstanding = [...unacknowledged];
        const localVector = encodeStateVector(doc);
        const hostVector = stateVector && new Uint8Array(stateVector);
        const missingStructs =
          hostVector &&
          (localVector.length !== hostVector.length ||
            localVector.some((byte, index) => byte !== hostVector[index]));
        if (upload && (missingStructs || outstanding.length)) {
          const delta = missingStructs
            ? encodeStateAsUpdateV2(doc, hostVector)
            : mergeUpdatesV2(outstanding);
          await upload(Uint8Array.from(delta).buffer);
          for (const update of outstanding) {
            unacknowledged.delete(update);
          }
          if (disposed) {
            return;
          }
        }
        cursor = nextCursor;
        retryDelay = 1000;
        ready();
      } catch (error) {
        if (!disposed) {
          cursor = undefined;
          failed(error instanceof Error ? error : new Error(String(error)));
          retry = setTimeout(() => {
            void request();
          }, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
        return;
      }
    }
  };
  function request(): Promise<void> {
    if (disposed) {
      return Promise.resolve();
    }
    clearTimeout(retry);
    retry = undefined;
    pending = true;
    running ??= run().finally(() => {
      running = undefined;
      // A revision may arrive after run() resolves but before this finalizer.
      if (pending && !disposed && retry === undefined) {
        void request();
      }
    });
    return running;
  }
  return {
    request,
    acknowledge(update: Uint8Array) {
      unacknowledged.delete(update);
    },
    dispose() {
      disposed = true;
      pending = false;
      clearTimeout(retry);
      doc.off("updateV2", changed);
      unacknowledged.clear();
    },
  };
}
