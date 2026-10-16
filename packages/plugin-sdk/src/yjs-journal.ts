import {
  encodeStateAsUpdateV2,
  encodeStateVector,
  mergeUpdatesV2,
  type Doc,
} from "yjs";

export interface YjsSyncCursor {
  epoch: string;
  revision: number;
}

/** A bounded history for one mounted host document. Missing history falls back to
 * a state-vector handshake; ordinary requests contain only update event bytes. */
export class YjsUpdateJournal {
  readonly epoch = crypto.randomUUID();
  private revision = 0;
  private bytes = 0;
  private updates: Array<{ revision: number; update: Uint8Array }> = [];

  constructor(
    private readonly doc: Doc,
    private readonly maxBytes = 4 * 1024 * 1024,
    private readonly maxUpdates = 256
  ) {}

  record(update: Uint8Array): void {
    this.revision++;
    if (update.byteLength > this.maxBytes) {
      this.updates = [];
      this.bytes = 0;
      return;
    }
    this.updates.push({ revision: this.revision, update: update.slice() });
    this.bytes += update.byteLength;
    while (
      this.bytes > this.maxBytes ||
      this.updates.length > this.maxUpdates
    ) {
      this.bytes -= this.updates.shift()!.update.byteLength;
    }
  }

  sync(vector: ArrayBuffer, cursor?: YjsSyncCursor) {
    const next = { epoch: this.epoch, revision: this.revision };
    const oldest = this.updates[0]?.revision ?? this.revision + 1;
    if (
      cursor?.epoch === this.epoch &&
      Number.isSafeInteger(cursor.revision) &&
      cursor.revision >= oldest - 1 &&
      cursor.revision <= this.revision
    ) {
      const updates = this.updates
        .filter((entry) => entry.revision > cursor.revision)
        .map((entry) => entry.update);
      return {
        cursor: next,
        update: Uint8Array.from(mergeUpdatesV2(updates)).buffer,
      };
    }
    return {
      cursor: next,
      update: Uint8Array.from(
        encodeStateAsUpdateV2(this.doc, new Uint8Array(vector))
      ).buffer,
      stateVector: Uint8Array.from(encodeStateVector(this.doc)).buffer,
    };
  }
}
