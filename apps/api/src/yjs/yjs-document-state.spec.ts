import { describe, expect, it } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import {
  Doc,
  encodeStateAsUpdateV2,
  encodeStateVector,
  XmlElement,
  XmlText,
} from "yjs";
import {
  decodeYjsStateVector,
  decodeYjsUpdateV2,
  workspaceYjsDocumentJson,
  reconstructYjsDocument,
} from "./yjs-document-state";

function base64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

describe("Yjs document state helpers", () => {
  it("validates and reconstructs V2 updates", () => {
    const source = new Doc();
    source.getText("content").insert(0, "hello");
    const update = decodeYjsUpdateV2(
      base64(encodeStateAsUpdateV2(source)),
    );

    const restored = reconstructYjsDocument([{ updateData: update }]);
    try {
      expect(restored.getText("content").toString()).toBe("hello");
    } finally {
      restored.destroy();
      source.destroy();
    }
  });

  it.each(["not base64", "AAAA"])("rejects invalid updates: %s", (value) => {
    expect(() => decodeYjsUpdateV2(value)).toThrow(BadRequestException);
  });

  it("validates state vectors", () => {
    const doc = new Doc();
    doc.getText("content").insert(0, "hello");
    const stateVector = encodeStateVector(doc);

    expect(decodeYjsStateVector(base64(stateVector))).toEqual(stateVector);
    expect(() => decodeYjsStateVector("not base64")).toThrow(
      BadRequestException,
    );
    expect(() => decodeYjsStateVector("AB==")).toThrow(BadRequestException);
    doc.destroy();
  });

  it("workspaces unnamed, named, and binary shared values", () => {
    const doc = new Doc();
    const paragraph = new XmlElement("paragraph");
    const text = new XmlText();
    text.insert(0, "Hello");
    paragraph.insert(0, [text]);
    doc.getXmlFragment().insert(0, [paragraph]);
    doc.getMap("task").set("description", "Draft");
    doc.getMap("assets").set("payload", new Uint8Array([1, 2, 3]));

    expect(workspaceYjsDocumentJson(doc)).toEqual({
      $root: "<paragraph>Hello</paragraph>",
      assets: { payload: { $binaryB64: "AQID" } },
      task: { description: "Draft" },
    });
    doc.destroy();
  });

  it("materializes unnamed XML roots reconstructed from remote updates", () => {
    const source = new Doc();
    const paragraph = new XmlElement("paragraph");
    const text = new XmlText();
    text.insert(0, "Remote");
    paragraph.insert(0, [text]);
    source.getXmlFragment().insert(0, [paragraph]);
    const restored = reconstructYjsDocument([
      { updateData: encodeStateAsUpdateV2(source) },
    ]);

    expect(workspaceYjsDocumentJson(restored)).toEqual({
      $root: "<paragraph>Remote</paragraph>",
    });
    restored.destroy();
    source.destroy();
  });

  it("returns an empty workspaceion for an empty document", () => {
    const doc = new Doc();
    expect(workspaceYjsDocumentJson(doc)).toEqual({});
    doc.destroy();
  });
});
