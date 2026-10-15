import {
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import {
  applyUpdateV2,
  Doc,
  decodeStateVector,
  decodeUpdateV2,
} from "yjs";

const BASE64_PATTERN = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/;
const UNNAMED_ROOT_KEY = "";

interface SharedRoot {
  _map: Map<string, unknown>;
  _start: {
    content?: {
      getRef?: () => number;
      type?: { constructor?: { name?: string } };
    };
  } | null;
}

export function decodeYjsUpdateV2(value: string): Buffer {
  const update = decodeBase64(value, "Yjs update");
  try {
    decodeUpdateV2(update);
  } catch {
    throw new BadRequestException("Invalid Yjs V2 update");
  }
  return update;
}

export function decodeYjsStateVector(value: string): Uint8Array {
  const stateVector = decodeBase64(value, "Yjs state vector");
  try {
    decodeStateVector(stateVector);
  } catch {
    throw new BadRequestException("Invalid Yjs state vector");
  }
  return stateVector;
}

export function isCanonicalBase64(value: string): boolean {
  if (!BASE64_PATTERN.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

export function reconstructYjsDocument(
  updates: ReadonlyArray<{ updateData: Uint8Array }>,
): Doc {
  const doc = new Doc();
  try {
    for (const { updateData } of updates) {
      applyUpdateV2(doc, updateData);
    }
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

export function workspaceYjsDocumentJson(doc: Doc): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of doc.share.keys()) {
    const workspaceedKey = key === UNNAMED_ROOT_KEY ? "$root" : key;
    if (Object.hasOwn(data, workspaceedKey)) {
      throw new InternalServerErrorException(
        "Yjs document contains conflicting JSON root keys",
      );
    }
    data[workspaceedKey] = normalizeJsonValue(resolveSharedTypeJson(doc, key));
  }
  return data;
}

function resolveSharedTypeJson(doc: Doc, key: string): unknown {
  // Remotely applied updates initially expose preliminary AbstractTypes.
  // Materialize the concrete public type before reading its JSON value.
  const shared = doc.share.get(key) as SharedRoot | undefined;
  if (!shared) return undefined;

  if (key === UNNAMED_ROOT_KEY) {
    return doc.getXmlFragment().toJSON();
  }
  if (shared._map.size > 0) {
    return doc.getMap(key).toJSON();
  }

  const contentRef = shared._start?.content?.getRef?.();
  if (contentRef === 7) {
    const nestedTypeName = shared._start?.content?.type?.constructor?.name;
    return nestedTypeName?.startsWith("YXml")
      ? doc.getXmlFragment(key).toJSON()
      : doc.getArray(key).toJSON();
  }
  if (contentRef === 4 || contentRef === 6) {
    return doc.getText(key).toJSON();
  }
  return doc.getArray(key).toJSON();
}

function decodeBase64(value: string, label: string): Buffer {
  if (!isCanonicalBase64(value)) {
    throw new BadRequestException(`Invalid base64 ${label}`);
  }
  return Buffer.from(value, "base64");
}

function normalizeJsonValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { $binaryB64: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        normalizeJsonValue(child),
      ]),
    );
  }
  if (value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  return value;
}
