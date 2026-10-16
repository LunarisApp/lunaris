import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYDoc } from "@blocknote/core/yjs";
import type { PluginYjsStorageUpdateRow } from "@lunarisapp/plugin-sdk";
import { describe, expect, it } from "vitest";
import { type Doc, encodeStateAsUpdateV2 } from "yjs";
import { buildRichTextVersionHistory } from "./version-history";

describe("buildRichTextVersionHistory", () => {
  it("groups nearby updates from the same user into one session", () => {
    const history = buildRichTextVersionHistory([
      makeUpdate({
        id: "u1",
        createdAt: "2026-04-19T10:00:00.000Z",
        lines: ["Hello"],
        userId: "user_1",
      }),
      makeUpdate({
        id: "u2",
        createdAt: "2026-04-19T10:01:00.000Z",
        lines: ["Hello", "World"],
        userId: "user_1",
      }),
    ]);

    expect(history).toHaveLength(1);
    expect(history[0]?.actorId).toBe("user_1");
    expect(history[0]?.addedCount).toBeGreaterThan(0);
    expect(history[0]?.removedCount).toBe(0);
  });

  it("splits sessions by actor or long time gap", () => {
    const alphaDoc = makeEditorDoc(["Alpha"]);
    const alphaBetaDoc = makeEditorDoc(["Alpha", "Beta"]);
    const gammaDoc = makeEditorDoc(["Gamma"]);
    const history = buildRichTextVersionHistory([
      makeUpdateFromDoc({
        createdAt: "2026-04-19T10:00:00.000Z",
        doc: alphaDoc,
        id: "u1",
        userId: "user_1",
      }),
      makeCapturedUpdate({
        createdAt: "2026-04-19T10:05:00.000Z",
        doc: alphaDoc,
        id: "u2",
        mutate: () => {
          const fragment = alphaDoc.getXmlFragment();
          fragment.delete(0, fragment.length);
        },
        userId: "user_1",
      }),
      makeUpdateFromDoc({
        createdAt: "2026-04-19T10:05:30.000Z",
        doc: alphaBetaDoc,
        id: "u2b",
        userId: "user_1",
      }),
      makeCapturedUpdate({
        createdAt: "2026-04-19T10:06:00.000Z",
        doc: alphaBetaDoc,
        id: "u3",
        mutate: () => {
          const fragment = alphaBetaDoc.getXmlFragment();
          fragment.delete(0, fragment.length);
        },
        userId: "user_2",
      }),
      makeUpdateFromDoc({
        createdAt: "2026-04-19T10:06:30.000Z",
        doc: gammaDoc,
        id: "u4",
        userId: "user_2",
      }),
    ]);

    expect(history).toHaveLength(3);
    expect(history[0]?.actorId).toBe("user_2");
    expect(history[1]?.actorId).toBe("user_1");
    expect(history[2]?.actorId).toBe("user_1");
  });

  it("throws on corrupt updates", () => {
    expect(() =>
      buildRichTextVersionHistory([
        {
          id: "bad",
          createdAt: "2026-04-19T10:00:00.000Z",
          updateBase64: "%%%bad%%%",
          userId: null,
        },
      ])
    ).toThrow("Invalid Yjs update");
  });

  it("drops sessions whose updates net to the same visible text", () => {
    const doc = makeEditorDoc(["Hello"]);
    const history = buildRichTextVersionHistory([
      makeUpdateFromDoc({
        createdAt: "2026-04-19T10:00:00.000Z",
        doc,
        id: "u1",
        userId: "user_1",
      }),
      makeCapturedUpdate({
        createdAt: "2026-04-19T10:01:00.000Z",
        doc,
        id: "u2",
        mutate: () => {
          const fragment = doc.getXmlFragment();
          fragment.delete(0, fragment.length);
        },
        userId: "user_1",
      }),
    ]);

    expect(history).toEqual([]);
  });

  it("drops sessions with no visible text delta", () => {
    const doc = makeEditorDoc(["Hello"]);
    const history = buildRichTextVersionHistory([
      makeUpdateFromDoc({
        createdAt: "2026-04-19T10:00:00.000Z",
        doc,
        id: "u1",
        userId: "user_1",
      }),
      makeCapturedUpdate({
        createdAt: "2026-04-19T10:05:00.000Z",
        doc,
        id: "u2",
        mutate: () => {
          doc.getMap("meta").set("updatedAt", "2026-04-19T10:05:00.000Z");
        },
        userId: "user_1",
      }),
    ]);

    expect(history).toHaveLength(1);
    expect(history[0]?.createdAt).toBe("2026-04-19T10:00:00.000Z");
    expect(history[0]?.addedCount).toBe(1);
  });

  it("keeps only visible text-change sessions when empty sessions are in between", () => {
    const alphaDoc = makeEditorDoc(["Alpha"]);
    const betaDoc = makeEditorDoc(["Beta"]);
    const history = buildRichTextVersionHistory([
      makeUpdateFromDoc({
        createdAt: "2026-04-19T10:00:00.000Z",
        doc: alphaDoc,
        id: "u1",
        userId: "user_1",
      }),
      makeCapturedUpdate({
        createdAt: "2026-04-19T10:05:00.000Z",
        doc: alphaDoc,
        id: "u2",
        mutate: () => {
          alphaDoc.getMap("meta").set("lastCursor", 5);
        },
        userId: "user_1",
      }),
      makeCapturedUpdate({
        createdAt: "2026-04-19T10:10:00.000Z",
        doc: alphaDoc,
        id: "u3",
        mutate: () => {
          const fragment = alphaDoc.getXmlFragment();
          fragment.delete(0, fragment.length);
        },
        userId: "user_1",
      }),
      makeUpdateFromDoc({
        createdAt: "2026-04-19T10:10:30.000Z",
        doc: betaDoc,
        id: "u4",
        userId: "user_1",
      }),
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      createdAt: "2026-04-19T10:10:00.000Z",
      removedCount: 1,
      addedCount: 1,
      lines: [
        { kind: "removed", text: "Alpha" },
        { kind: "added", text: "Beta" },
      ],
    });
    expect(history[1]).toMatchObject({
      createdAt: "2026-04-19T10:00:00.000Z",
      addedCount: 1,
      removedCount: 0,
      lines: [{ kind: "added", text: "Alpha" }],
    });
  });
});

function makeUpdate({
  createdAt,
  id,
  lines,
  userId,
}: {
  createdAt: string;
  id: string;
  lines: string[];
  userId: string | null;
}): PluginYjsStorageUpdateRow {
  return {
    createdAt,
    id,
    updateBase64: uint8ArrayToB64(makeStateUpdate(lines)),
    userId,
  };
}

function makeStateUpdate(lines: string[]): Uint8Array {
  const doc = makeEditorDoc(lines);

  try {
    return encodeStateAsUpdateV2(doc);
  } finally {
    doc.destroy();
  }
}

function uint8ArrayToB64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function makeCapturedUpdate({
  createdAt,
  doc,
  id,
  mutate,
  userId,
}: {
  createdAt: string;
  doc: Doc;
  id: string;
  mutate: () => void;
  userId: string | null;
}): PluginYjsStorageUpdateRow {
  return {
    createdAt,
    id,
    updateBase64: uint8ArrayToB64(captureDocUpdate(doc, mutate)),
    userId,
  };
}

function makeUpdateFromDoc({
  createdAt,
  doc,
  id,
  userId,
}: {
  createdAt: string;
  doc: Doc;
  id: string;
  userId: string | null;
}): PluginYjsStorageUpdateRow {
  return {
    createdAt,
    id,
    updateBase64: uint8ArrayToB64(encodeStateAsUpdateV2(doc)),
    userId,
  };
}

function captureDocUpdate(doc: Doc, mutate: () => void): Uint8Array {
  let capturedUpdate: Uint8Array | null = null;

  doc.on("updateV2", captureUpdate);

  doc.transact(() => {
    mutate();
  });

  doc.off("updateV2", captureUpdate);

  if (!capturedUpdate) {
    throw new Error("Expected Yjs update to be captured");
  }

  return capturedUpdate;

  function captureUpdate(update: Uint8Array) {
    capturedUpdate = update;
  }
}

function makeEditorDoc(lines: string[]): Doc {
  const editor = BlockNoteEditor.create();
  return blocksToYDoc(
    editor,
    lines.map((line, index) => ({
      id: `block_${index}`,
      type: "paragraph",
      props: {
        backgroundColor: "default",
        textAlignment: "left",
        textColor: "default",
      },
      content: [{ type: "text", text: line, styles: {} }],
      children: [],
    })),
    ""
  );
}
