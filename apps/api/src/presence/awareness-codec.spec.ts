import { describe, expect, it } from "bun:test";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import { encodeAwareness, readOwnedAwareness } from "./awareness-codec";

const identity = { id: "ada", name: "Ada", color: "#1d4ed8", image: "" };
describe("presence awareness protocol", () => {
  it("round trips relative cursors, overwrites forged identity, and never edits content", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    let updates = 0;
    doc.on("update", () => updates++);
    const position = Y.createRelativePositionFromTypeIndex(
      doc.getXmlFragment(),
      0
    );
    awareness.setLocalState({
      user: { id: "victim", name: "Imposter", email: "private" },
      cursor: { anchor: position, head: position },
      privateField: "drop",
    });
    const entry = readOwnedAwareness(
      encodeAwarenessUpdate(awareness, [doc.clientID]),
      doc.clientID,
      identity
    );
    expect(entry.state).toEqual({
      user: identity,
      cursor: { anchor: position, head: position },
    });
    const peer = new Awareness(new Y.Doc());
    applyAwarenessUpdate(peer, encodeAwareness([entry]), "remote");
    expect(peer.getStates().get(doc.clientID)?.user).toEqual(identity);
    expect(updates).toBe(0);
    awareness.destroy();
    doc.destroy();
    peer.destroy();
    peer.doc.destroy();
  });
  it("rejects another client's entry, batches, malformed cursors and excessive payloads", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const packet = encodeAwarenessUpdate(awareness, [doc.clientID]);
    expect(() =>
      readOwnedAwareness(packet, doc.clientID + 1, identity)
    ).toThrow();
    expect(() =>
      readOwnedAwareness(
        encodeAwarenessUpdate(awareness, [doc.clientID, doc.clientID]),
        doc.clientID,
        identity
      )
    ).toThrow();
    awareness.setLocalState({ cursor: { anchor: "wrong", head: {} } });
    expect(() =>
      readOwnedAwareness(
        encodeAwarenessUpdate(awareness, [doc.clientID]),
        doc.clientID,
        identity
      )
    ).toThrow();
    expect(() =>
      readOwnedAwareness(new Uint8Array(9000), doc.clientID, identity)
    ).toThrow();
    awareness.destroy();
    doc.destroy();
  });
});

describe("resource and channel frames", () => {
  it("rejects non-finite JSON numbers", () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, 7);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarString(encoder, '{"data":1e999}');
    expect(() =>
      readOwnedAwareness(encoding.toUint8Array(encoder), 7, identity, "channel")
    ).toThrow("JSON number");
  });
  it("strips interaction data from membership and accepts bounded channel JSON", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalState({
      data: { selected: ["card"] },
      user: { id: "forged" },
      cursor: null,
    });
    const packet = () => encodeAwarenessUpdate(awareness, [doc.clientID]);
    expect(
      readOwnedAwareness(packet(), doc.clientID, identity, "resource").state
    ).toEqual({ user: identity });
    expect(
      readOwnedAwareness(packet(), doc.clientID, identity, "channel").state
    ).toEqual({ user: identity, data: { selected: ["card"] } });
    awareness.setLocalState({ data: "x".repeat(4097) });
    expect(() =>
      readOwnedAwareness(packet(), doc.clientID, identity, "channel")
    ).toThrow("large");
    let deep: unknown = null;
    for (let i = 0; i < 10; i++) {
      deep = { deep };
    }
    awareness.setLocalState({ data: deep });
    expect(() =>
      readOwnedAwareness(packet(), doc.clientID, identity, "channel")
    ).toThrow("deep");
    awareness.destroy();
    doc.destroy();
  });
});
