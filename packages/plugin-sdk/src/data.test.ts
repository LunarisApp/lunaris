import { describe, expect, it, vi } from "vitest";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import { reconstructYjsDoc, withYjsDoc } from "./data";
import type { PluginResourceReadContext } from "./resource-data";
import type { ResourceStorageHandle } from "./types";

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return btoa(s);
}

function createMockDb(doc: Doc): PluginResourceReadContext {
  const update = encodeStateAsUpdateV2(doc);
  return {
    getYjsStorageUpdates: vi
      .fn()
      .mockResolvedValue([{ updateBase64: b64(update) }]),
    getWorkspaceResource: vi.fn().mockResolvedValue(null),
    getWorkspaceResourceChildren: vi.fn().mockResolvedValue([]),
    resolveResource: vi.fn().mockResolvedValue({ status: "ready" }),
  };
}

function createEmptyDb(): PluginResourceReadContext {
  return {
    getYjsStorageUpdates: vi.fn().mockResolvedValue([]),
    getWorkspaceResource: vi.fn().mockResolvedValue(null),
    getWorkspaceResourceChildren: vi.fn().mockResolvedValue([]),
    resolveResource: vi.fn().mockResolvedValue({ status: "ready" }),
  };
}

describe("Yjs data helpers", () => {
  it("returns null when reconstructing an empty document", async () => {
    await expect(
      reconstructYjsDoc(createEmptyDb(), {
        kind: "yjs",
        storageId: "storage-1",
      } as ResourceStorageHandle)
    ).resolves.toBeNull();
  });

  it("reconstructs Yjs state and destroys with withYjsDoc", async () => {
    const doc = new Doc();
    doc.getMap("props").set("name", "Alice");
    const db = createMockDb(doc);
    doc.destroy();

    let destroyed = false;
    const out = await withYjsDoc(
      db,
      { kind: "yjs", storageId: "storage-1" } as ResourceStorageHandle,
      (restored) => {
        restored.on("destroy", () => {
          destroyed = true;
        });
        return restored.getMap("props").get("name");
      },
      null
    );

    expect(out).toBe("Alice");
    expect(destroyed).toBe(true);
  });
});
