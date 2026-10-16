import type { IconSvgObject } from "./constants";
import type { JsonObject, JsonValue } from "./json";
import type { PluginManifest } from "./manifest";
import type { ResourceStorageHandles, ViewPlacement } from "./types";

export const PLUGIN_SANDBOX_PROTOCOL_VERSION = 7 as const;
export function isSupportedSandboxProtocol(
  protocol: number
): protocol is 6 | 7 {
  return protocol === 6 || protocol === PLUGIN_SANDBOX_PROTOCOL_VERSION;
}

export const PLUGIN_SANDBOX_RPC_TIMEOUT_MS = 30_000;

export const PLUGIN_SANDBOX_BOOTSTRAP_SOURCE =
  'if(origin!=="null")throw new Error("Sandbox bootstrap requires an opaque origin");const decode=id=>Uint8Array.from(atob(document.getElementById(id)?.textContent||""),value=>value.charCodeAt(0));const style=document.createElement("style");style.textContent=new TextDecoder().decode(decode("lunaris-plugin-style"));document.head.append(style);const scriptUrl=URL.createObjectURL(new Blob([decode("lunaris-plugin-script")],{type:"text/javascript"}));const script=document.createElement("script");script.src=scriptUrl;script.onload=script.onerror=()=>URL.revokeObjectURL(scriptUrl);document.head.append(script);';

export const PLUGIN_SANDBOX_BOOTSTRAP_CSP =
  "'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg='";

export interface PluginSandboxRuntimeRequirement {
  kind: "iframe";
  protocol: 6 | typeof PLUGIN_SANDBOX_PROTOCOL_VERSION;
}

export const PLUGIN_SANDBOX_RUNTIME = Object.freeze({
  kind: "iframe",
  protocol: PLUGIN_SANDBOX_PROTOCOL_VERSION,
}) satisfies PluginSandboxRuntimeRequirement;

export type SandboxWireValue =
  | JsonValue
  | ArrayBuffer
  | SandboxWireValue[]
  | { [key: string]: SandboxWireValue };

export type SandboxWireObject = { [key: string]: SandboxWireValue };

export function cloneSandboxWireValue(
  value: unknown,
  label: string
): SandboxWireValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "string"
  ) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneSandboxWireValue(item, label));
  }
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, cloneSandboxWireValue(item, label)])
    );
  }
  throw new Error(
    `${label} must be structured-clone-safe JSON or ArrayBuffer data`
  );
}

function cloneSandboxJson(
  value: unknown,
  label: string,
  seen: WeakSet<object>
): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error(`${label} must not contain cycles`);
    }
    seen.add(value);
    const clone = value.map((item) => cloneSandboxJson(item, label, seen));
    seen.delete(value);
    return clone;
  }
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    if (seen.has(value)) {
      throw new Error(`${label} must not contain cycles`);
    }
    seen.add(value);
    const clone = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cloneSandboxJson(item, label, seen),
      ])
    );
    seen.delete(value);
    return clone;
  }
  throw new Error(`${label} must contain only JSON values`);
}

export function cloneSandboxJsonValue(
  value: unknown,
  label: string
): JsonValue {
  return cloneSandboxJson(value, label, new WeakSet());
}

const SANDBOX_ICON_TAGS = new Set([
  "circle",
  "ellipse",
  "g",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
]);

export function assertSandboxIcon(
  value: unknown,
  label: string
): asserts value is IconSvgObject {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an IconSvgObject`);
  }
  for (const entry of value) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      !SANDBOX_ICON_TAGS.has(entry[0]) ||
      !entry[1] ||
      typeof entry[1] !== "object" ||
      Array.isArray(entry[1])
    ) {
      throw new Error(`${label} contains an unsafe SVG node`);
    }
    for (const [name, attribute] of Object.entries(entry[1])) {
      if (
        name.toLowerCase().startsWith("on") ||
        name.toLowerCase().includes("href") ||
        name === "dangerouslySetInnerHTML" ||
        (typeof attribute !== "string" && typeof attribute !== "number")
      ) {
        throw new Error(`${label} contains an unsafe SVG attribute`);
      }
    }
  }
}

export type SandboxHandlerKind =
  | "command"
  | "service"
  | "slot"
  | "create"
  | "initialize"
  | "migration"
  | "payload-read"
  | "payload-write"
  | "renderer"
  | "search-indexer"
  | "search-query"
  | "search-query-open"
  | "status-bar"
  | "validate";

export interface SerializedSandboxCommand {
  children?: SerializedSandboxCommand[];
  group?: number;
  handler?: string;
  icon?: IconSvgObject;
  id: string;
  labelKey: string;
  variant?: "destructive";
}

export interface SerializedSandboxResourceType {
  createHandler?: string;
  defaultViewId?: string;
  hierarchy?: { userCreatable?: boolean; visible?: boolean };
  icon: IconSvgObject;
  name: string;
  resourceTypeId: string;
  schema: {
    currentVersion: number;
    id: string;
    migrationHandlers: Array<{ from: number; handler: string; to: number }>;
    readHandler: string;
    validationHandlers: Record<string, string>;
    writeHandler?: string;
  };
  storage: Record<
    string,
    {
      initializeHandler?: string;
      kind: "file" | "key-value" | "yjs";
    }
  >;
  type: "resource-type";
}

export interface SerializedSandboxView {
  icon: IconSvgObject;
  name: string;
  renderer: string;
  rendererSandbox?: "local-srcdoc";
  statusBar?: string;
  storageRequirements?: Record<string, "file" | "key-value" | "yjs">;
  target:
    | { kind: "standalone"; launcher?: { defaultPlacement?: ViewPlacement } }
    | {
        kind: "resource";
        resourceTypeIds?: string[];
        schemas?: Array<{
          id: string;
          maximumVersion?: number;
          minimumVersion?: number;
        }>;
      };
  type: "view";
  viewId: string;
}

export interface SerializedSandboxWorkspaceStorage {
  kind: "key-value";
  storageId: string;
  type: "workspace-storage";
}

export interface SerializedSandboxResourceCommand {
  commands: SerializedSandboxCommand[];
  id: string;
  resourceTypeIds?: string[];
  schemas?: Array<{
    id: string;
    maximumVersion?: number;
    minimumVersion?: number;
  }>;
  type: "resource-command";
}

export interface SerializedSandboxServiceProvider {
  handlers: Record<string, string>;
  id: string;
  methods: string[];
  type: "service-provider";
  version: string;
}

export interface SerializedSandboxSlotContribution {
  contributorId: string;
  handler: string;
  id: string;
  metadata: SandboxWireObject;
  serviceId: string;
  serviceVersion: string;
  slotId: string;
  type: "service-slot";
}

export interface SerializedSandboxSearchIndexer {
  handler: string;
  id: string;
  resourceTypeIds?: string[];
  schemas?: Array<{
    id: string;
    maximumVersion?: number;
    minimumVersion?: number;
  }>;
  type: "search-indexer";
}

export interface SerializedSandboxSearchQuery {
  id: string;
  openHandler: string;
  queryHandler: string;
  type: "search-query";
}

export interface SerializedSandboxPluginDefinition {
  contributions: Array<
    | SerializedSandboxResourceType
    | SerializedSandboxWorkspaceStorage
    | SerializedSandboxResourceCommand
    | SerializedSandboxServiceProvider
    | SerializedSandboxSlotContribution
    | SerializedSandboxSearchIndexer
    | SerializedSandboxSearchQuery
    | SerializedSandboxView
  >;
  locales?: Record<string, Record<string, JsonValue>>;
  manifest: PluginManifest;
}

export interface SandboxRpcError {
  message: string;
  name: string;
}

export type SandboxHostRequest =
  | { id: string; type: "activate" }
  | {
      error?: SandboxRpcError;
      id: string;
      type: "host-result";
      value?: SandboxWireValue;
    }
  | {
      commandContext?: SandboxResourceCommandContext;
      handler: string;
      id: string;
      input?: SandboxWireValue;
      type: "invoke";
    }
  | {
      host: SandboxWireObject;
      id: string;
      params: JsonObject;
      renderer: string;
      type: "render";
    }
  | { host: SandboxWireObject; id: string; type: "snapshot" }
  | { id: string; type: "dispose" };

export type SandboxPluginMessage =
  | {
      definition: SerializedSandboxPluginDefinition;
      protocol: 6 | typeof PLUGIN_SANDBOX_PROTOCOL_VERSION;
      type: "registered";
    }
  | { error: SandboxRpcError; type: "registration-failed" }
  | { error: SandboxRpcError; id: string; type: "failure" }
  | {
      args: SandboxWireValue[];
      id: string;
      method: string;
      parentId: string;
      type: "host-call";
    }
  | { id: string; type: "ready" }
  | { id: string; type: "result"; value?: SandboxWireValue };

export interface SandboxResourceCommandContext {
  resourceId: string;
  resourceName: string;
  resourceTypeId: string;
  storage: ResourceStorageHandles;
}

export function sandboxHandlerKey(
  kind: SandboxHandlerKind,
  owner: string,
  id = "default"
): string {
  return `${kind}:${owner}:${id}`;
}
