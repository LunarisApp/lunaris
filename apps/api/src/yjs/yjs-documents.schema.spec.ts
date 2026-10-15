import { describe, expect, it } from "bun:test";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import {
  appendYjsDocumentUpdateSchema,
  createYjsDocumentSchema,
  YjsDocumentStateQueryDto,
  YjsDocumentsListQueryDto,
} from "./yjs-documents.schema";

const updateB64 = Buffer.from(encodeStateAsUpdateV2(new Doc())).toString(
  "base64",
);

describe("Yjs document schemas", () => {
  it("accepts empty and initialized document creation", () => {
    expect(createYjsDocumentSchema.parse({})).toEqual({});
    expect(
      createYjsDocumentSchema.parse({ initialUpdateB64: updateB64 }),
    ).toEqual({ initialUpdateB64: updateB64 });
  });

  it("accepts canonical update base64 and rejects malformed values", () => {
    expect(appendYjsDocumentUpdateSchema.parse({ updateB64 })).toEqual({
      updateB64,
    });
    expect(() =>
      appendYjsDocumentUpdateSchema.parse({ updateB64: "not base64" }),
    ).toThrow();
  });

  it("applies pagination defaults and limits", () => {
    expect(YjsDocumentsListQueryDto.parse({})).toEqual({ limit: 50 });
    expect(() => YjsDocumentsListQueryDto.parse({ limit: 101 })).toThrow();
  });

  it("validates optional state-vector base64", () => {
    expect(YjsDocumentStateQueryDto.parse({})).toEqual({});
    expect(() =>
      YjsDocumentStateQueryDto.parse({ stateVectorB64: "%%%" }),
    ).toThrow();
    expect(() =>
      YjsDocumentStateQueryDto.parse({ stateVectorB64: "AB==" }),
    ).toThrow();
  });
});
