import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { describe, expect, it, vi } from "vitest";
import {
  Doc,
  encodeStateAsUpdateV2,
  XmlElement,
  XmlText,
  Map as YMap,
} from "yjs";
import {
  compileYjsDocumentJson,
  getYjsDocumentUpdateCount,
  getYjsDocumentUpdateRows,
  insertYjsDocumentUpdate,
} from "./services";

vi.mock("../workspaces/services", () => ({
  resolveWorkspaceVisibility: vi
    .fn()
    .mockResolvedValue(WORKSPACE_VISIBILITY.shared),
}));

function toB64(update: Uint8Array) {
  return btoa(String.fromCharCode(...update));
}

describe("yjs services", () => {
  it("returns empty object when a document has no updates", async () => {
    const db = {
      getAll: vi.fn().mockResolvedValue([]),
    };

    await expect(compileYjsDocumentJson(db, "doc_1")).resolves.toEqual({});
  });

  it("replays updates and returns final merged json", async () => {
    const doc = new Doc();
    doc.getMap("meta").set("title", "First");
    const updateA = encodeStateAsUpdateV2(doc);
    doc.getMap("meta").set("title", "Second");
    doc.getMap("meta").set("status", "draft");
    const updateB = encodeStateAsUpdateV2(doc);
    doc.destroy();

    const db = {
      getAll: vi
        .fn()
        .mockResolvedValue([
          { update_b64: toB64(updateA) },
          { update_b64: toB64(updateB) },
        ]),
    };

    await expect(compileYjsDocumentJson(db, "doc_1")).resolves.toEqual({
      meta: {
        title: "Second",
        status: "draft",
      },
    });
  });

  it("flattens an unnamed xml root into the compiled json", async () => {
    const doc = new Doc();
    const fragment = doc.getXmlFragment();
    const paragraph = new XmlElement("paragraph");
    const text = new XmlText();
    text.insert(0, "Hello world");
    paragraph.insert(0, [text]);
    fragment.insert(0, [paragraph]);
    const update = encodeStateAsUpdateV2(doc);
    doc.destroy();

    const db = {
      getAll: vi.fn().mockResolvedValue([{ update_b64: toB64(update) }]),
    };

    await expect(compileYjsDocumentJson(db, "doc_1")).resolves.toEqual(
      "<paragraph>Hello world</paragraph>"
    );
  });

  it("preserves unnamed roots in mixed-root documents under $root", async () => {
    const doc = new Doc();
    doc.getMap("meta").set("title", "Doc");
    const fragment = doc.getXmlFragment();
    const paragraph = new XmlElement("paragraph");
    const text = new XmlText();
    text.insert(0, "Hello world");
    paragraph.insert(0, [text]);
    fragment.insert(0, [paragraph]);
    const update = encodeStateAsUpdateV2(doc);
    doc.destroy();

    const db = {
      getAll: vi.fn().mockResolvedValue([{ update_b64: toB64(update) }]),
    };

    await expect(compileYjsDocumentJson(db, "doc_1")).resolves.toEqual({
      meta: {
        title: "Doc",
      },
      $root: "<paragraph>Hello world</paragraph>",
    });
  });

  it("keeps arrays of nested y-maps as arrays of objects", async () => {
    const doc = new Doc();
    const properties = doc.getArray("properties");
    const property = new YMap();
    property.set("id", "prop_1");
    property.set("name", "Status");
    properties.push([property]);

    const items = doc.getArray("items");
    const item = new YMap();
    item.set("id", "item_1");
    item.set("name", "Task 1");
    items.push([item]);

    const update = encodeStateAsUpdateV2(doc);
    doc.destroy();

    const db = {
      getAll: vi.fn().mockResolvedValue([{ update_b64: toB64(update) }]),
    };

    await expect(compileYjsDocumentJson(db, "doc_1")).resolves.toEqual({
      properties: [{ id: "prop_1", name: "Status" }],
      items: [{ id: "item_1", name: "Task 1" }],
    });
  });

  it("surfaces malformed update data as an error", async () => {
    const db = {
      getAll: vi.fn().mockResolvedValue([{ update_b64: "not-base64" }]),
    };

    await expect(compileYjsDocumentJson(db, "doc_1")).rejects.toThrow();
  });

  it("returns the update count for a document", async () => {
    const db = {
      getOptional: vi.fn().mockResolvedValue({ count: 3 }),
    };

    await expect(getYjsDocumentUpdateCount(db, "doc_1")).resolves.toBe(3);
  });

  it("returns full update rows in stable chronological order", async () => {
    const rows = [
      {
        id: "u1",
        user_id: "user_1",
        update_b64: "first",
        created_at: "2026-04-19T10:00:00.000Z",
      },
      {
        id: "u2",
        user_id: null,
        update_b64: "second",
        created_at: "2026-04-19T10:00:00.000Z",
      },
    ];
    const db = {
      getAll: vi.fn().mockResolvedValue(rows),
    };

    await expect(getYjsDocumentUpdateRows(db, "doc_1")).resolves.toEqual(rows);

    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY created_at ASC, id ASC"),
      ["doc_1"]
    );
  });

  it("writes user_id when provided for local attribution transport", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await insertYjsDocumentUpdate(
      db as never,
      "doc_1",
      "workspace_1",
      "update-b64",
      "user_1"
    );

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining(
        "(id, document_id, workspace_id, user_id, update_b64, created_at, updated_at)"
      ),
      expect.arrayContaining(["doc_1", "workspace_1", "user_1", "update-b64"])
    );
  });

  it("writes null user_id when no local user id is provided", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    await insertYjsDocumentUpdate(
      db as never,
      "doc_1",
      "workspace_1",
      "update-b64"
    );

    expect(db.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["doc_1", "workspace_1", null, "update-b64"])
    );
  });
});
