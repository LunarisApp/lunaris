import {
  assertNoPresenceTicketRequest,
  createPresenceCapabilities,
} from "./presence-capabilities";
import { useAwarenessChannels } from "../host/resource-presence";
import { useResourceViewPresenceScope } from "@lunarisapp/plugin-sdk";
import type {
  ViewDefinition,
  PluginFileMetadata,
  PluginPermission,
  PluginStoredFileMetadata,
  ResourceStorageHandle,
  PluginUser,
  SandboxHostRequest,
  SandboxPluginMessage,
  SandboxWireValue,
  SerializedSandboxPluginDefinition,
} from "@lunarisapp/plugin-sdk";

type ExternalRendererSandbox = NonNullable<ViewDefinition["rendererSandbox"]>;
import {
  PLUGIN_SANDBOX_BOOTSTRAP_CSP,
  PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
  isSupportedSandboxProtocol,
  PluginDownloadReceiver,
  YjsUpdateJournal,
  type YjsSyncCursor,
  PLUGIN_SANDBOX_RPC_TIMEOUT_MS,
} from "@lunarisapp/plugin-sdk";
import {
  cloneSandboxWireValue,
  usePluginSdkRuntime,
} from "@lunarisapp/plugin-sdk/internal";
import { builtInPluginMcpTools } from "@repo/agent-contracts";
import { usePowerSync } from "@repo/data/core";
import {
  createStorageValueService,
  ensureWorkspaceStorageSlot,
  getStorageValue,
  useWorkspaceStorageSlots,
  useStorageValues,
} from "@repo/data/features/workspace-storage-slots";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { applyUpdateV2, encodeStateAsUpdateV2 } from "yjs";
import { toPluginLocale } from "../host/locale";

const CONNECT_MESSAGE = "lunaris-plugin-sandbox-connect";
const REGISTRATION_TIMEOUT_MS = 10_000;
const FRAME_CSP = [
  "default-src 'none'",
  `script-src blob: ${PLUGIN_SANDBOX_BOOTSTRAP_CSP}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "worker-src blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");
const LOCAL_SRCDOC_FRAME_CSP = [
  "default-src 'none'",
  `script-src blob: 'unsafe-inline' ${PLUGIN_SANDBOX_BOOTSTRAP_CSP}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data: blob:",
  "media-src data: blob:",
  "connect-src blob:",
  "worker-src blob:",
  "object-src 'none'",
  "frame-src 'self' blob:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const BASE_STYLE = `
:root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
html, body, #root { width: 100%; height: 100%; margin: 0; }
body { background: transparent; color: inherit; overflow: auto; }
*, *::before, *::after { box-sizing: border-box; }
`;

const APPROVED_CSS_VARIABLES = [
  "--background",
  "--foreground",
  "--muted",
  "--muted-foreground",
  "--primary",
  "--primary-foreground",
  "--border",
  "--radius",
] as const;

function serializePluginUser(user: PluginUser | undefined) {
  if (!user) {
    return;
  }
  return {
    email: user.email ?? null,
    id: user.id,
    image: user.image ?? null,
    name: user.name ?? null,
  };
}

interface PendingRequest {
  capabilities: SandboxRequestCapabilities;
  persistent: boolean;
  reject(error: Error): void;
  resolve(value: unknown): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PersistentRequest {
  capabilities: SandboxRequestCapabilities;
  request: SandboxHostRequest;
}

type SandboxRegistrationMessage = Extract<
  SandboxPluginMessage,
  { type: "registered" }
>;
type SandboxHostCallMessage = Extract<
  SandboxPluginMessage,
  { type: "host-call" }
>;
type SandboxCompletionMessage = Extract<
  SandboxPluginMessage,
  { type: "failure" | "ready" | "result" }
>;

export type SandboxRequestCapabilities = Record<
  string,
  (...args: never[]) => Promise<unknown> | unknown
>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function pluginFrameHtml(
  script: Uint8Array,
  style: string,
  rendererSandbox?: ExternalRendererSandbox
): string {
  const frameCsp =
    rendererSandbox === "local-srcdoc" ? LOCAL_SRCDOC_FRAME_CSP : FRAME_CSP;
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${frameCsp}">`,
    `<script type="application/octet-stream" id="lunaris-plugin-script">${bytesToBase64(script)}</script>`,
    `<script type="application/octet-stream" id="lunaris-plugin-style">${bytesToBase64(new TextEncoder().encode(style))}</script>`,
    `<script>${PLUGIN_SANDBOX_BOOTSTRAP_SOURCE}</script>`,
    '</head><body><div id="root"></div></body></html>',
  ].join("");
}

function sandboxError(error: { message: string; name: string }): Error {
  const value = new Error(error.message);
  value.name = error.name;
  return value;
}

function serializeError(error: unknown) {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: String(error), name: "Error" };
}

class SandboxFrameConnection {
  readonly definition: Promise<SerializedSandboxPluginDefinition>;
  readonly iframe: HTMLIFrameElement;
  private disposal?: Promise<void>;
  private disposed = false;
  private definitionResolved = false;
  private readonly pluginId: string;
  private port?: MessagePort;
  private registered = false;
  protocol: 6 | 7 = 6;
  private registrationTimeout?: ReturnType<typeof setTimeout>;
  private releaseUrls: () => void = () => undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly persistentRequests = new Map<string, PersistentRequest>();
  private readonly contexts = new Map<string, SandboxRequestCapabilities>();
  private rejectDefinition: (error: Error) => void = () => undefined;
  private resolveDefinition: (
    definition: SerializedSandboxPluginDefinition
  ) => void = () => undefined;

  constructor({
    hidden,
    pluginId,
    rendererSandbox,
    script,
    style,
  }: {
    hidden: boolean;
    pluginId: string;
    rendererSandbox?: ExternalRendererSandbox;
    script: Uint8Array;
    style?: string;
  }) {
    this.pluginId = pluginId;
    this.definition = new Promise((resolve, reject) => {
      this.resolveDefinition = resolve;
      this.rejectDefinition = reject;
    });
    const iframe = document.createElement("iframe");
    this.iframe = iframe;
    iframe.dataset.lunarisPluginSandbox = pluginId;
    iframe.setAttribute("allow", "");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.referrerPolicy = "no-referrer";
    iframe.title = `${pluginId} extension sandbox`;
    if (hidden) {
      iframe.hidden = true;
      iframe.setAttribute("aria-hidden", "true");
    } else {
      Object.assign(iframe.style, {
        background: "transparent",
        border: "0",
        display: "block",
        height: "100%",
        // Keep the initial WebView canvas from flashing before runtime CSS loads.
        visibility: "hidden",
        width: "100%",
      } satisfies CSSProperties);
    }

    // Seed the theme before extension JavaScript runs, including older bundles
    // that acknowledge rendering before React commits its environment effects.
    const theme = document.createElement("div").style;
    theme.colorScheme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    const hostStyle = getComputedStyle(document.documentElement);
    for (const name of APPROVED_CSS_VARIABLES) {
      theme.setProperty(name, hostStyle.getPropertyValue(name));
    }
    const combinedStyle = `${BASE_STYLE}\n${style ?? ""}\n:root { ${theme.cssText} }`;
    const documentUrl = URL.createObjectURL(
      new Blob([pluginFrameHtml(script, combinedStyle, rendererSandbox)], {
        type: "text/html",
      })
    );
    let urlsReleased = false;
    this.releaseUrls = () => {
      if (urlsReleased) {
        return;
      }
      urlsReleased = true;
      URL.revokeObjectURL(documentUrl);
    };
    // Dockview can reuse the iframe's src when a panel is reactivated.
    // Keep that URL valid for the full frame lifetime.
    this.registrationTimeout = setTimeout(() => {
      const error = new Error(`Extension "${pluginId}" did not register`);
      this.rejectDefinition(error);
      this.terminate(error);
    }, REGISTRATION_TIMEOUT_MS);
    iframe.addEventListener("load", () => this.connect());
    iframe.addEventListener(
      "error",
      () => this.terminate(new Error(`Extension "${pluginId}" sandbox failed`)),
      { once: true }
    );
    iframe.src = documentUrl;
  }

  private connect(): void {
    const contentWindow = this.iframe.contentWindow;
    if (this.disposed || this.disposal || !contentWindow) {
      return;
    }
    this.iframe.style.visibility = "hidden";
    this.port?.close();
    this.registered = false;
    const channel = new MessageChannel();
    this.port = channel.port1;
    channel.port1.onmessage = ({
      data,
    }: MessageEvent<SandboxPluginMessage>) => {
      this.handleMessage(data);
    };
    channel.port1.start();
    contentWindow.postMessage(
      { pluginId: this.pluginId, type: CONNECT_MESSAGE },
      "*",
      [channel.port2]
    );
  }

  private handleMessage(data: SandboxPluginMessage): void {
    if (!data || typeof data !== "object") {
      this.terminate(
        new Error(`Extension "${this.pluginId}" sent malformed RPC`)
      );
      return;
    }
    switch (data.type) {
      case "registered":
        this.handleRegistration(data);
        return;
      case "registration-failed":
        this.terminate(sandboxError(data.error));
        return;
      case "host-call":
        void this.handleHostCall(data);
        return;
      case "failure":
      case "ready":
      case "result":
        this.handleCompletion(data);
        return;
      default:
        this.terminate(
          new Error(`Extension "${this.pluginId}" sent unknown RPC`)
        );
    }
  }

  private handleRegistration(data: SandboxRegistrationMessage): void {
    if (
      this.registered ||
      !isSupportedSandboxProtocol(data.protocol) ||
      !data.definition ||
      typeof data.definition !== "object" ||
      !Array.isArray(data.definition.contributions)
    ) {
      this.terminate(
        new Error(
          `Extension "${this.pluginId}" returned an invalid sandbox registration`
        )
      );
      return;
    }
    this.protocol = data.protocol;
    this.registered = true;
    clearTimeout(this.registrationTimeout);
    if (!this.definitionResolved) {
      this.definitionResolved = true;
      this.resolveDefinition(data.definition);
      return;
    }
    for (const { capabilities, request } of this.persistentRequests.values()) {
      this.contexts.set(request.id, capabilities);
      this.post(request, "Host RPC reconnect request");
    }
  }

  private async handleHostCall(data: SandboxHostCallMessage): Promise<void> {
    if (
      !this.registered ||
      typeof data.id !== "string" ||
      typeof data.parentId !== "string" ||
      typeof data.method !== "string" ||
      !Array.isArray(data.args)
    ) {
      this.terminate(
        new Error(`Extension "${this.pluginId}" sent malformed RPC`)
      );
      return;
    }
    let args: SandboxWireValue[];
    try {
      args = cloneSandboxWireValue(
        data.args,
        "Sandbox RPC arguments"
      ) as SandboxWireValue[];
    } catch (error) {
      this.terminate(sandboxError(serializeError(error)));
      return;
    }
    const capability = this.contexts.get(data.parentId)?.[data.method];
    if (!capability) {
      this.post(
        {
          error: {
            message: `Unknown sandbox capability: ${data.method}`,
            name: "Error",
          },
          id: data.id,
          type: "host-result",
        },
        "Host RPC response"
      );
      return;
    }
    try {
      const value = await capability(...(args as never[]));
      this.post(
        {
          id: data.id,
          type: "host-result",
          value:
            value === undefined
              ? undefined
              : cloneSandboxWireValue(value, "Host RPC result"),
        },
        "Host RPC response"
      );
    } catch (error) {
      this.post(
        {
          error: serializeError(error),
          id: data.id,
          type: "host-result",
        },
        "Host RPC response"
      );
    }
  }

  private handleCompletion(data: SandboxCompletionMessage): void {
    if (typeof data.id !== "string") {
      this.terminate(
        new Error(`Extension "${this.pluginId}" sent unknown RPC`)
      );
      return;
    }
    if (
      data.type === "ready" &&
      !this.disposed &&
      !this.disposal &&
      this.persistentRequests.get(data.id)?.request.type === "render"
    ) {
      // Replayed renders after navigation have no pending promise to resolve.
      this.iframe.style.visibility = "visible";
    }
    const request = this.pending.get(data.id);
    if (!request) {
      return;
    }
    this.pending.delete(data.id);
    if (!request.persistent) {
      this.contexts.delete(data.id);
    }
    clearTimeout(request.timeout);
    if (data.type === "failure") {
      this.persistentRequests.delete(data.id);
      this.contexts.delete(data.id);
      if (
        !data.error ||
        typeof data.error.message !== "string" ||
        typeof data.error.name !== "string"
      ) {
        const error = new Error(
          `Extension "${this.pluginId}" sent malformed RPC`
        );
        request.reject(error);
        this.terminate(error);
        return;
      }
      request.reject(sandboxError(data.error));
      return;
    }
    try {
      request.resolve(
        data.type === "result" && data.value !== undefined
          ? cloneSandboxWireValue(data.value, "Sandbox RPC result")
          : undefined
      );
    } catch (error) {
      const reason = sandboxError(serializeError(error));
      request.reject(reason);
      this.terminate(reason);
    }
  }

  private post(request: SandboxHostRequest, label: string): void {
    this.port?.postMessage(cloneSandboxWireValue(request, label));
  }

  request(
    request: SandboxHostRequest,
    capabilities: SandboxRequestCapabilities = {},
    persistent = false
  ): Promise<unknown> {
    if (this.disposed || !this.port) {
      return Promise.reject(new Error("Extension sandbox is unavailable"));
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        this.contexts.delete(request.id);
        this.persistentRequests.delete(request.id);
        reject(
          new Error(`Extension sandbox request timed out: ${request.type}`)
        );
      }, PLUGIN_SANDBOX_RPC_TIMEOUT_MS);
      this.pending.set(request.id, {
        capabilities,
        persistent,
        reject,
        resolve,
        timeout,
      });
      this.contexts.set(request.id, capabilities);
      if (persistent) {
        this.persistentRequests.set(request.id, { capabilities, request });
      }
      this.post(request, "Host RPC request");
    });
  }

  update(
    id: string,
    host: Record<string, unknown>,
    capabilities: SandboxRequestCapabilities
  ): void {
    if (this.disposed) {
      return;
    }
    this.contexts.set(id, capabilities);
    const persistent = this.persistentRequests.get(id);
    if (persistent?.request.type === "render") {
      persistent.capabilities = capabilities;
      persistent.request = { ...persistent.request, host: host as never };
    }
    if (!(this.port && this.registered)) {
      return;
    }
    this.post(
      { host: host as never, id, type: "snapshot" },
      "Host RPC snapshot"
    );
  }

  dispose(reason = new Error("Extension sandbox disposed")): Promise<void> {
    if (this.disposal) {
      return this.disposal;
    }
    if (!(this.registered && this.port)) {
      this.terminate(reason);
      return Promise.resolve();
    }
    const disposal = this.request({
      id: crypto.randomUUID(),
      type: "dispose",
    })
      .then(() => undefined)
      .finally(() => this.terminate(reason));
    this.disposal = disposal;
    return disposal;
  }

  private terminate(reason: Error): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    clearTimeout(this.registrationTimeout);
    this.releaseUrls();
    this.rejectDefinition(reason);
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(reason);
    }
    this.pending.clear();
    this.persistentRequests.clear();
    this.contexts.clear();
    this.port?.close();
    this.iframe.remove();
  }
}

export class ExternalPluginSandboxSession {
  get protocol(): 6 | 7 {
    return this.control?.protocol ?? 6;
  }
  private control?: SandboxFrameConnection;
  private deactivation?: Promise<void>;
  private disposed = false;
  private readonly frames = new Set<SandboxFrameConnection>();
  readonly pluginId: string;
  private readonly script: Uint8Array;
  private readonly style?: string;

  constructor(pluginId: string, script: Uint8Array, style?: string) {
    this.pluginId = pluginId;
    this.script = script;
    this.style = style;
  }

  async start(): Promise<SerializedSandboxPluginDefinition> {
    if (this.disposed) {
      throw new Error("Extension sandbox disposed");
    }
    const control = this.createFrame(true);
    this.control = control;
    document.body.append(control.iframe);
    return control.definition;
  }

  async activate(): Promise<void> {
    if (!this.control) {
      throw new Error("Extension sandbox not started");
    }
    await this.control.request({
      id: crypto.randomUUID(),
      type: "activate",
    });
  }

  invoke(
    handler: string,
    input?: unknown,
    capabilities?: SandboxRequestCapabilities
  ): Promise<unknown> {
    if (!this.control) {
      return Promise.reject(new Error("Extension sandbox not started"));
    }
    return this.control.request(
      {
        handler,
        id: crypto.randomUUID(),
        input: input as never,
        type: "invoke",
      },
      capabilities
    );
  }

  mount(
    container: HTMLElement,
    renderer: string,
    rendererSandbox: ExternalRendererSandbox | undefined,
    params: Record<string, unknown>,
    host: Record<string, unknown>,
    capabilities: SandboxRequestCapabilities,
    onError: (error: Error) => void
  ) {
    const frame = this.createFrame(false, rendererSandbox);
    const requestId = crypto.randomUUID();
    let disposed = false;
    let currentHost = host;
    let currentCapabilities = capabilities;
    const resetPresence = () => {
      void currentCapabilities["presence.reset"]?.();
    };
    frame.iframe.addEventListener("load", resetPresence);
    container.replaceChildren(frame.iframe);
    void frame.definition
      .then(() =>
        frame.request(
          {
            host: currentHost as never,
            id: requestId,
            params: params as never,
            renderer,
            type: "render",
          },
          currentCapabilities,
          true
        )
      )
      .catch((error) => {
        if (disposed) {
          return;
        }
        onError(error instanceof Error ? error : new Error(String(error)));
      });
    return {
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        frame.iframe.removeEventListener("load", resetPresence);
        resetPresence();
        void frame
          .dispose()
          .catch(() => undefined)
          .finally(() => this.frames.delete(frame));
      },
      update: (
        nextHost: Record<string, unknown>,
        nextCapabilities: SandboxRequestCapabilities
      ) => {
        currentHost = nextHost;
        currentCapabilities = nextCapabilities;
        frame.update(requestId, nextHost, nextCapabilities);
      },
    };
  }

  deactivate(): Promise<void> {
    if (this.deactivation) {
      return this.deactivation;
    }
    this.disposed = true;
    const frames = [...this.frames];
    this.frames.clear();
    this.control = undefined;
    const deactivation = Promise.allSettled(
      frames.map((frame) => frame.dispose())
    ).then((results) => {
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : []
      );
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "Extension sandbox cleanup failed");
      }
    });
    this.deactivation = deactivation;
    return deactivation;
  }

  dispose(): void {
    void this.deactivate().catch(() => undefined);
  }

  private createFrame(
    hidden: boolean,
    rendererSandbox?: ExternalRendererSandbox
  ): SandboxFrameConnection {
    if (this.disposed) {
      throw new Error("Extension sandbox disposed");
    }
    const frame = new SandboxFrameConnection({
      hidden,
      pluginId: this.pluginId,
      rendererSandbox,
      script: this.script,
      style: this.style,
    });
    this.frames.add(frame);
    return frame;
  }
}

function useSandboxEnvironment() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setRevision((value) => value + 1);
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributeFilter: ["class", "style"],
      attributes: true,
    });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      colorScheme: document.documentElement.classList.contains("dark")
        ? "dark"
        : "light",
      cssVariables: Object.fromEntries(
        APPROVED_CSS_VARIABLES.map((name) => [
          name,
          styles.getPropertyValue(name),
        ])
      ),
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    };
  }, [revision]);
}

function toLegacyFileMetadata(
  metadata: PluginStoredFileMetadata | null
): PluginFileMetadata | null {
  if (!metadata) {
    return null;
  }
  return {
    attachmentId: metadata.fileId,
    fileExtension: metadata.fileExtension,
    filename: metadata.filename,
    mediaType: metadata.mediaType,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
  };
}

function useSandboxStoredFile(
  storage: ResourceStorageHandle,
  useStoredFile: ReturnType<typeof usePluginSdkRuntime>["host"]["useStoredFile"]
) {
  const storedFile = useStoredFile(storage);
  const [bytes, setBytes] = useState<ArrayBuffer>();
  useEffect(() => {
    let cancelled = false;
    setBytes(undefined);
    if (!storedFile.objectUrl) {
      return;
    }
    void fetch(storedFile.objectUrl)
      .then((response) => response.arrayBuffer())
      .then((value) => {
        if (!cancelled) {
          setBytes(value);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [storedFile.objectUrl]);
  return { ...storedFile, bytes };
}

function useSandboxYjs(
  storage: ResourceStorageHandle | undefined,
  workspaceId: string,
  userId: string | null,
  enabled: boolean,
  useReadyYjsDocument: ReturnType<
    typeof usePluginSdkRuntime
  >["data"]["useReadyYjsStorage"]
) {
  const yjs = useReadyYjsDocument(storage, workspaceId, {
    enabled: enabled && Boolean(storage && workspaceId),
    userId,
  });
  const [revision, setRevision] = useState(0);
  const journal = useMemo(
    () => (yjs.yDoc ? new YjsUpdateJournal(yjs.yDoc) : null),
    [yjs.yDoc]
  );
  const [persistenceState, setPersistenceState] = useState<
    "error" | "idle" | "persisting"
  >("idle");
  useEffect(() => {
    if (!yjs.yDoc) {
      return;
    }
    const update = (bytes: Uint8Array) => {
      journal?.record(bytes);
      setRevision((value) => value + 1);
    };
    yjs.yDoc.on("updateV2", update);
    return () => yjs.yDoc?.off("updateV2", update);
  }, [journal, yjs.yDoc]);
  useEffect(() => {
    if (!yjs.yProvider) {
      setPersistenceState("idle");
      return;
    }
    setPersistenceState(yjs.yProvider.getPersistenceState());
    return yjs.yProvider.subscribePersistenceState(setPersistenceState);
  }, [yjs.yProvider]);
  return { ...yjs, persistenceState, revision, journal };
}

interface SandboxedExtensionRendererProps {
  params: Record<string, unknown>;
  permissions: readonly PluginPermission[];
  renderer: string;
  rendererSandbox?: ExternalRendererSandbox;
  session: ExternalPluginSandboxSession;
  surfaceCapabilities?: SandboxRequestCapabilities;
}

function recordParam(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getSandboxResourceContext(params: Record<string, unknown>) {
  const panelParams = recordParam(params.params);
  const resource = recordParam(params.resource);
  const rawStorage = recordParam(params.storage) ?? {};
  const storage = Object.fromEntries(
    Object.entries(rawStorage).filter(
      (entry): entry is [string, ResourceStorageHandle] => {
        const value = recordParam(entry[1]);
        return Boolean(
          value &&
            typeof value.storageId === "string" &&
            (value.kind === "file" ||
              value.kind === "key-value" ||
              value.kind === "yjs")
        );
      }
    )
  );
  return {
    resourceId:
      stringParam(resource?.resourceId) ??
      stringParam(panelParams?.resourceId) ??
      stringParam(params.resourceId) ??
      "",
    storage,
  };
}

export function assertFileStorageScope(
  resources: ReadonlyMap<string, { resourceTypeId: string }>,
  resourceId: string,
  extensionId: string
) {
  const resourceTypeId = resources.get(resourceId)?.resourceTypeId;
  if (
    resourceTypeId !== extensionId &&
    !resourceTypeId?.startsWith(`${extensionId}.`)
  ) {
    throw new Error("File storage resource scope mismatch");
  }
}

function useSandboxFrame({
  capabilities,
  host,
  params,
  renderer,
  rendererSandbox,
  session,
}: Omit<SandboxedExtensionRendererProps, "permissions"> & {
  capabilities: SandboxRequestCapabilities;
  host: Record<string, unknown>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mount = useRef<ReturnType<ExternalPluginSandboxSession["mount"]>>(null);
  const [error, setError] = useState<Error | null>(null);
  const paramsJson = JSON.stringify(params);
  // Host state updates through the next effect; remount only when frame identity changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: host and capabilities are delivered by mount.update without resetting the iframe.
  useEffect(() => {
    if (!container.current) {
      return;
    }
    setError(null);
    const current = session.mount(
      container.current,
      renderer,
      rendererSandbox,
      JSON.parse(paramsJson) as Record<string, unknown>,
      host,
      capabilities,
      setError
    );
    mount.current = current;
    return () => {
      mount.current = null;
      current.dispose();
    };
  }, [paramsJson, renderer, rendererSandbox, session]);
  useEffect(
    () => mount.current?.update(host, capabilities),
    [capabilities, host]
  );
  return { container, error };
}

type SandboxRuntime = ReturnType<typeof usePluginSdkRuntime>;
type SandboxFileEntry = {
  handle: ResourceStorageHandle;
  state: ReturnType<typeof useSandboxStoredFile>;
};
type SandboxYjsEntry = {
  handle: ResourceStorageHandle;
  state: ReturnType<typeof useSandboxYjs>;
  lastEdited: ReturnType<SandboxRuntime["host"]["useYjsStorageLastEdited"]>;
};
type SandboxKvBinding = { actualId: string; exposedId: string };
type SandboxKvEntry = SandboxKvBinding & {
  rows: ReturnType<typeof useStorageValues>;
};
interface SandboxStorageEntries {
  fileStorageEntries: SandboxFileEntry[];
  kvEntries: SandboxKvEntry[];
  yjsEntries: SandboxYjsEntry[];
}
type SandboxBinding =
  | { kind: "file" | "yjs"; handle: ResourceStorageHandle }
  | { kind: "key-value"; binding: SandboxKvBinding };

function SandboxFileBinding({
  handle,
  children,
}: {
  handle: ResourceStorageHandle;
  children: (entry: SandboxFileEntry) => ReactNode;
}) {
  const runtime = usePluginSdkRuntime();
  const state = useSandboxStoredFile(handle, runtime.host.useStoredFile);
  return children({ handle, state });
}
function SandboxYjsBinding({
  handle,
  enabled,
  children,
}: {
  handle: ResourceStorageHandle;
  enabled: boolean;
  children: (entry: SandboxYjsEntry) => ReactNode;
}) {
  const runtime = usePluginSdkRuntime();
  const workspace = runtime.host.useCurrentWorkspace();
  const user = runtime.host.useCurrentUser();
  const state = useSandboxYjs(
    handle,
    workspace.workspaceId,
    user.user?.id ?? null,
    enabled,
    runtime.data.useReadyYjsStorage
  );
  const lastEdited = runtime.host.useYjsStorageLastEdited(handle);
  return children({ handle, state, lastEdited });
}
function SandboxKvBinding({
  binding,
  children,
}: {
  binding: SandboxKvBinding;
  children: (entry: SandboxKvEntry) => ReactNode;
}) {
  const rows = useStorageValues(binding.actualId);
  return children({ ...binding, rows });
}

// Each storage owns a component: changing slot count cannot change hook order.
// A schema change remounts the nested frame; value changes only update its host.
function SandboxStorageBindings({
  bindings,
  index = 0,
  entries,
  enabled,
  children,
}: {
  bindings: SandboxBinding[];
  index?: number;
  entries: SandboxStorageEntries;
  enabled: boolean;
  children: (entries: SandboxStorageEntries) => ReactNode;
}): ReactNode {
  const binding = bindings[index];
  if (!binding) {
    return children(entries);
  }
  const next = (resolved: SandboxStorageEntries) => (
    <SandboxStorageBindings
      bindings={bindings}
      index={index + 1}
      entries={resolved}
      enabled={enabled}
    >
      {children}
    </SandboxStorageBindings>
  );
  if (binding.kind === "key-value") {
    return (
      <SandboxKvBinding
        key={binding.binding.exposedId}
        binding={binding.binding}
      >
        {(entry) =>
          next({ ...entries, kvEntries: [...entries.kvEntries, entry] })
        }
      </SandboxKvBinding>
    );
  }
  if (binding.kind === "file") {
    return (
      <SandboxFileBinding
        key={binding.handle.storageId}
        handle={binding.handle}
      >
        {(entry) =>
          next({
            ...entries,
            fileStorageEntries: [...entries.fileStorageEntries, entry],
          })
        }
      </SandboxFileBinding>
    );
  }
  return (
    <SandboxYjsBinding
      key={binding.handle.storageId}
      handle={binding.handle}
      enabled={enabled}
    >
      {(entry) =>
        next({ ...entries, yjsEntries: [...entries.yjsEntries, entry] })
      }
    </SandboxYjsBinding>
  );
}

export function SandboxedExtensionRenderer(
  props: SandboxedExtensionRendererProps
) {
  const { params, session, permissions } = props;
  const runtime = usePluginSdkRuntime();
  const db = usePowerSync();
  const currentWorkspace = runtime.host.useCurrentWorkspace();
  const { storage: resourceStorage } = getSandboxResourceContext(params);
  const workspaceStorageDefinitions = useMemo(
    () =>
      runtime.contributions
        .getWorkspaceStorages()
        .filter((entry) => entry.extensionId === session.pluginId),
    [runtime.contributions, session.pluginId]
  );
  const workspaceSlots = useWorkspaceStorageSlots(currentWorkspace.workspaceId);
  useEffect(() => {
    for (const { definition } of workspaceStorageDefinitions) {
      if (
        workspaceSlots.data.some(
          (slot) =>
            slot.plugin_id === session.pluginId &&
            slot.name === definition.storageId
        )
      ) {
        continue;
      }
      void ensureWorkspaceStorageSlot({
        db,
        name: definition.storageId,
        pluginId: session.pluginId,
        workspaceId: currentWorkspace.workspaceId,
      });
    }
  }, [
    currentWorkspace.workspaceId,
    db,
    workspaceSlots.data,
    workspaceStorageDefinitions,
    session.pluginId,
  ]);
  const kvBindings = [
    ...Object.values(resourceStorage)
      .filter((handle) => handle.kind === "key-value")
      .map((handle) => ({
        actualId: handle.storageId,
        exposedId: handle.storageId,
      })),
    ...workspaceStorageDefinitions.map(({ definition }) => ({
      actualId:
        workspaceSlots.data.find(
          (slot) =>
            slot.plugin_id === session.pluginId &&
            slot.name === definition.storageId
        )?.id ?? "",
      exposedId: `${session.pluginId}:${definition.storageId}`,
    })),
  ];

  const bindings: SandboxBinding[] = [
    ...Object.values(resourceStorage).flatMap((handle): SandboxBinding[] =>
      handle.kind === "file" || handle.kind === "yjs"
        ? [{ kind: handle.kind, handle }]
        : []
    ),
    ...kvBindings.map(
      (binding): SandboxBinding => ({ kind: "key-value", binding })
    ),
  ];
  return (
    <SandboxStorageBindings
      bindings={bindings}
      entries={{ fileStorageEntries: [], yjsEntries: [], kvEntries: [] }}
      enabled={
        permissions.includes("content.read") &&
        permissions.includes("content.write")
      }
    >
      {(entries) => (
        <ResolvedSandboxedExtensionRenderer {...props} {...entries} />
      )}
    </SandboxStorageBindings>
  );
}

function ResolvedSandboxedExtensionRenderer({
  params,
  permissions,
  renderer,
  rendererSandbox,
  session,
  surfaceCapabilities,
  fileStorageEntries,
  yjsEntries,
  kvEntries,
}: SandboxedExtensionRendererProps & SandboxStorageEntries) {
  const presenceScope = useResourceViewPresenceScope();
  const presenceChannels = useAwarenessChannels();
  const presenceRevision = useSyncExternalStore(
    presenceChannels?.subscribe ?? emptyPresenceSubscribe,
    presenceChannels?.getSnapshot ?? emptyPresenceSnapshot,
    emptyPresenceSnapshot
  );
  const runtime = usePluginSdkRuntime();
  const api = runtime.host.useApiTransport();
  const db = usePowerSync();
  const currentWorkspace = runtime.host.useCurrentWorkspace();
  const currentUser = runtime.host.useCurrentUser();
  const fileStorage = runtime.host.useFileStorage();
  const locale = runtime.host.useLocale().locale;
  const lunarisContent = runtime.host.useLunarisContent();
  const members = runtime.host.useOrgMembersMap();
  const pluginFetch = runtime.host.usePluginFetch();
  const downloads = runtime.host.useDownloads();
  const downloadReceiver = useMemo(
    () => new PluginDownloadReceiver(downloads),
    [downloads]
  );
  useEffect(() => () => downloadReceiver.clear(), [downloadReceiver]);
  const resourceReadContext = runtime.host.useResourceReadContext();
  const children = runtime.host.useWorkspaceChildrenMap();
  const itemActions = runtime.host.useWorkspaceResourceActions();
  const items = runtime.host.useWorkspaceResourcesMap();
  const resourceTrash = runtime.host.useWorkspaceTrashMap();
  const access = runtime.host.useOrganizationAccess?.() ?? {
    canDeleteContent: true,
    canWriteContent: true,
  };
  const navigation = runtime.host.useOrganizationNavigation();
  const getYjsStorageUpdateRows = runtime.host.useYjsStorageUpdateRows();
  const stableEmpty = runtime.host.useStableInitialLoading({ dataEmpty: true });
  const canReadContent = permissions.includes("content.read");
  const canWriteContent = permissions.includes("content.write");
  const canReadAndWriteContent = canReadContent && canWriteContent;
  const canReadFiles = permissions.includes("files.read");
  const canWriteFiles = permissions.includes("files.write");
  const canWriteDownloads = permissions.includes("downloads.write");
  const canUseNetwork = permissions.includes("network.https");
  const { resourceId, storage: resourceStorage } =
    getSandboxResourceContext(params);
  const ownsPresence =
    canReadContent &&
    presenceScope?.resourceId === resourceId &&
    renderer.startsWith("renderer:");
  const ownedPresenceIds = useMemo(
    () => new Set<string>(),
    [presenceChannels, renderer]
  );
  const resetPresence = useCallback(() => {
    for (const id of ownedPresenceIds) {
      presenceChannels?.close(id);
    }
    ownedPresenceIds.clear();
  }, [ownedPresenceIds, presenceChannels]);
  useEffect(() => {
    if (!ownsPresence) {
      resetPresence();
    }
    return resetPresence;
  }, [ownsPresence, resetPresence]);
  const serviceVersion = useSyncExternalStore(
    runtime.services.subscribe.bind(runtime.services),
    runtime.services.getVersion.bind(runtime.services),
    runtime.services.getVersion.bind(runtime.services)
  );
  const extensionServices = useMemo(
    () => runtime.services.snapshot(session.pluginId),
    [runtime.services, serviceVersion, session.pluginId]
  );
  const environment = useSandboxEnvironment();
  const host = useMemo(
    () => ({
      access,
      ...(ownsPresence && presenceScope && presenceChannels
        ? {
            presence: {
              version: 1,
              active: presenceScope.isVisible,
              membership: presenceScope.presence,
              channels: presenceChannels
                .snapshot()
                .filter((entry) => ownedPresenceIds.has(entry.id)),
            },
          }
        : {}),
      ...(canUseNetwork ? { api: { baseUrl: api.baseUrl } } : {}),
      ...(canReadFiles
        ? {
            attachments: fileStorageEntries.map(({ handle, state }) => ({
              attachment: state.file,
              bytes: state.bytes,
              storageId: handle.storageId,
              mediaType: state.metadata?.mediaType,
              metadata: toLegacyFileMetadata(state.metadata),
            })),
          }
        : {}),
      currentWorkspace,
      currentUser: {
        isLoading: currentUser.isLoading,
        user: serializePluginUser(currentUser.user),
      },
      environment,
      extensionServices,
      ...(canReadContent
        ? {
            lastEdited: yjsEntries.map(({ handle, lastEdited }) => ({
              storageId: handle.storageId,
              isLoading: lastEdited.isLoading,
              lastEditedAt: lastEdited.lastEditedAt?.toISOString() ?? null,
            })),
          }
        : {}),
      locale: toPluginLocale({ locale }),
      ...(canReadAndWriteContent
        ? {
            lunarisContent: {
              activeWorkspaceId: lunarisContent.activeWorkspaceId,
              activeResourceId: lunarisContent.activeResourceId,
              activeStorage: lunarisContent.activeStorage,
              agentToolPolicies: Object.fromEntries(
                builtInPluginMcpTools.map(({ name }) => [
                  name,
                  lunarisContent.getAgentToolPolicy(name),
                ])
              ),
            },
          }
        : {}),
      members: {
        isLoading: members.isLoading,
        items: Array.from(members.map, ([id, user]) => [
          id,
          serializePluginUser(user),
        ]),
      },
      ...(canReadContent
        ? {
            workspaceChildren: Array.from(children.entries()),
            resources: Array.from(items.entries()),
            resourceTrash: Array.from(resourceTrash.entries()),
          }
        : {}),
      ...(canReadAndWriteContent
        ? {
            storage: {
              slots: Object.fromEntries(
                kvEntries.map(({ exposedId, rows }) => [
                  exposedId,
                  {
                    isFetching: rows.isFetching,
                    isLoading: rows.isLoading,
                    items: rows.data
                      .filter((row) => row.key && row.value != null)
                      .map((row) => {
                        try {
                          return [row.key!, JSON.parse(row.value!)] as const;
                        } catch {
                          return [row.key!, row.value] as const;
                        }
                      }),
                  },
                ])
              ),
            },
          }
        : {}),
      stableEmpty,
      ...(canReadAndWriteContent
        ? {
            yjs: yjsEntries.map(({ handle, state }) => ({
              storageId: handle.storageId,
              persistenceState: state.persistenceState,
              workspaceId: currentWorkspace.workspaceId,
              revision: state.revision,
              epoch: state.journal?.epoch,
              available: Boolean(state.yDoc),
              incremental: session.protocol >= 7,
              update:
                state.yDoc && session.protocol < 7
                  ? encodeStateAsUpdateV2(state.yDoc).buffer
                  : undefined,
            })),
          }
        : {}),
    }),
    [
      access,
      api.baseUrl,
      ownsPresence,
      ownedPresenceIds,
      resetPresence,
      resourceStorage,
      presenceScope,
      presenceChannels,
      presenceRevision,
      canReadAndWriteContent,
      canReadContent,
      canReadFiles,
      canUseNetwork,
      fileStorageEntries,
      children,
      currentWorkspace,
      currentUser,
      environment,
      extensionServices,
      resourceId,
      items,
      resourceTrash,
      locale,
      lunarisContent,
      session.protocol,
      lunarisContent.activeWorkspaceId,
      lunarisContent.activeResourceId,
      lunarisContent.activeStorage,
      members.isLoading,
      members.map,
      kvEntries,
      stableEmpty,
      yjsEntries,
    ]
  );
  const capabilities = useMemo<SandboxRequestCapabilities>(
    () => ({
      ...surfaceCapabilities,
      ...(ownsPresence && presenceScope && presenceChannels
        ? createPresenceCapabilities(
            presenceChannels,
            session.pluginId,
            resourceStorage,
            ownedPresenceIds,
            resetPresence
          )
        : {}),
      ...(canUseNetwork
        ? {
            "api.fetch": async (
              input: RequestInfo | URL,
              init?: RequestInit
            ) => {
              assertNoPresenceTicketRequest(input, api.baseUrl);
              return serializeFetchResponse(await api.fetch(input, init));
            },
            "plugin.fetch": async (
              input: RequestInfo | URL,
              init?: RequestInit
            ) => {
              assertNoPresenceTicketRequest(input, api.baseUrl);
              return serializeFetchResponse(await pluginFetch(input, init));
            },
          }
        : {}),
      ...(canReadFiles
        ? {
            "attachment.download": (storageId: string) => {
              const handle = fileStorageEntries.find(
                (entry) => entry.handle.storageId === storageId
              )?.handle;
              if (!handle) {
                throw new Error("Invalid file storage download");
              }
              return fileStorage.download(handle);
            },
          }
        : {}),
      ...(canWriteFiles
        ? {
            "attachment.upload": async (input: {
              bytes: ArrayBuffer;
              filename: string;
              storageId: string;
              mediaType: string;
            }) => {
              if (
                !(input?.bytes instanceof ArrayBuffer) ||
                typeof input.filename !== "string" ||
                typeof input.storageId !== "string" ||
                typeof input.mediaType !== "string"
              ) {
                throw new Error("Invalid attachment upload");
              }
              const handle = fileStorageEntries.find(
                (entry) => entry.handle.storageId === input.storageId
              )?.handle;
              if (!handle) {
                throw new Error("File storage scope mismatch");
              }
              const metadata = await fileStorage.upload({
                file: new File([input.bytes], input.filename, {
                  type: input.mediaType,
                }),
                storage: handle,
              });
              return toLegacyFileMetadata(metadata);
            },
          }
        : {}),
      ...(canWriteDownloads
        ? {
            "downloads.begin": (input: {
              mimeType: string;
              suggestedName: string;
            }) => downloadReceiver.begin(input),
            "downloads.write": (id: string, chunk: ArrayBuffer) =>
              downloadReceiver.write(id, chunk),
            "downloads.complete": (id: string) => downloadReceiver.complete(id),
            "downloads.abort": (id: string) => downloadReceiver.abort(id),
            "downloads.save": (input: {
              data: ArrayBuffer;
              mimeType: string;
              suggestedName: string;
            }) => downloads.save(input),
          }
        : {}),
      "services.invoke": (
        serviceId: string,
        method: string,
        input: import("@lunarisapp/plugin-sdk").SandboxWireValue
      ) =>
        runtime.services.invokeService(
          session.pluginId,
          serviceId,
          method,
          input
        ),
      "services.invokeSlot": (
        registrationId: string,
        input: import("@lunarisapp/plugin-sdk").SandboxWireValue
      ) => runtime.services.invokeSlot(session.pluginId, registrationId, input),
      ...(canReadContent
        ? {
            "data.getWorkspaceResource":
              resourceReadContext.getWorkspaceResource,
            "data.getWorkspaceResourceChildren":
              resourceReadContext.getWorkspaceResourceChildren,
            "data.getYjsStorageUpdates":
              resourceReadContext.getYjsStorageUpdates,
            "data.resolveResource": resourceReadContext.resolveResource,
            "yjs.sync": (
              storageId: string,
              stateVector: ArrayBuffer,
              cursor?: YjsSyncCursor
            ) => {
              const entry = yjsEntries.find(
                (candidate) => candidate.handle.storageId === storageId
              );
              if (!(entry?.state.yDoc && entry.state.journal)) {
                throw new Error("Yjs storage scope mismatch");
              }
              if (
                !(stateVector instanceof ArrayBuffer) ||
                stateVector.byteLength > 1024 * 1024
              ) {
                throw new Error("Invalid Yjs state vector");
              }
              return entry.state.journal.sync(stateVector, cursor);
            },
            "yjs.getUpdateRows": (storageId: string) => {
              const entry = yjsEntries.find(
                (candidate) => candidate.handle.storageId === storageId
              );
              if (!entry) {
                throw new Error("Yjs storage scope mismatch");
              }
              return getYjsStorageUpdateRows(entry.handle);
            },
          }
        : {}),
      ...(canWriteContent
        ? {
            "resources.create": itemActions.createResource,
            "resources.delete": itemActions.deleteResource,
            "resources.rename": itemActions.renameResource,
            "resources.reorder": itemActions.reorderResources,
            "resources.touch": itemActions.touchResource,
          }
        : {}),
      "navigation.closeViewInstances": navigation.closeViewInstances,
      "navigation.navigateToWorkspaceResource":
        navigation.navigateToWorkspaceResource,
      "navigation.openEntityReference": navigation.openEntityReference,
      "navigation.openResource": navigation.openResource,
      "navigation.openResourceInNewWindow": navigation.openResourceInNewWindow,
      "navigation.openView": navigation.openView,
      "navigation.openViewInNewWindow": navigation.openViewInNewWindow,
      "navigation.setViewInstanceTitle": navigation.setViewInstanceTitle,
      ...(canReadAndWriteContent
        ? {
            "content.executeAgentTool": lunarisContent.executeAgentTool,
            "content.listWorkspaces": lunarisContent.listWorkspaces,
            "content.readYjsStorageJson": lunarisContent.readYjsStorageJson,
            "content.searchResources": lunarisContent.searchResources,
            "storage.get": async (storageId: string, key: string) => {
              const binding = kvEntries.find(
                (entry) => entry.exposedId === storageId
              );
              if (!binding?.actualId) {
                throw new Error("Extension storage scope mismatch");
              }
              const raw = (await getStorageValue(db, binding.actualId, key))
                ?.value;
              if (raw == null) {
                return null;
              }
              try {
                return JSON.parse(raw);
              } catch {
                return raw;
              }
            },
            "storage.remove": async (storageId: string, key: string) => {
              const binding = kvEntries.find(
                (entry) => entry.exposedId === storageId
              );
              if (!binding?.actualId) {
                throw new Error("Extension storage scope mismatch");
              }
              if (!access.canDeleteContent) {
                throw new Error("Permission denied");
              }
              await createStorageValueService(
                db,
                currentWorkspace.workspaceId,
                binding.actualId
              ).remove(key);
            },
            "storage.set": async (
              storageId: string,
              key: string,
              value: unknown
            ) => {
              const binding = kvEntries.find(
                (entry) => entry.exposedId === storageId
              );
              if (!binding?.actualId) {
                throw new Error("Extension storage scope mismatch");
              }
              if (!access.canWriteContent) {
                throw new Error("Permission denied");
              }
              await createStorageValueService(
                db,
                currentWorkspace.workspaceId,
                binding.actualId
              ).set(key, value);
            },
            "yjs.applyUpdate": (storageId: string, update: ArrayBuffer) => {
              const yjs = yjsEntries.find(
                (entry) => entry.handle.storageId === storageId
              )?.state;
              if (!yjs?.yDoc) {
                throw new Error("Yjs document scope mismatch");
              }
              if (!access.canWriteContent) {
                throw new Error("Permission denied");
              }
              if (!(update instanceof ArrayBuffer)) {
                throw new Error("Invalid Yjs update");
              }
              applyUpdateV2(yjs.yDoc, new Uint8Array(update), session);
            },
            "yjs.waitForPersistence": (storageId: string) => {
              const yjs = yjsEntries.find(
                (entry) => entry.handle.storageId === storageId
              )?.state;
              if (!yjs?.yProvider) {
                throw new Error("Yjs document scope mismatch");
              }
              return yjs.yProvider.waitForPersistence();
            },
          }
        : {}),
    }),
    [
      api,
      downloadReceiver,
      access.canDeleteContent,
      access.canWriteContent,
      canReadAndWriteContent,
      canReadContent,
      canReadFiles,
      canUseNetwork,
      canWriteContent,
      canWriteDownloads,
      canWriteFiles,
      downloads,
      fileStorage,
      itemActions,
      items,
      getYjsStorageUpdateRows,
      lunarisContent,
      navigation,
      pluginFetch,
      currentWorkspace.workspaceId,
      db,
      fileStorageEntries,
      session,
      resourceReadContext,
      runtime.services,
      kvEntries,
      surfaceCapabilities,
      ownsPresence,
      ownedPresenceIds,
      resetPresence,
      resourceStorage,
      presenceScope,
      presenceChannels,
      yjsEntries,
    ]
  );
  const { container, error } = useSandboxFrame({
    capabilities,
    host,
    params,
    renderer,
    rendererSandbox,
    session,
    surfaceCapabilities,
  });
  return (
    <div className="relative size-full min-h-0">
      <div className="size-full min-h-0" ref={container} />
      {error ? (
        <div
          className="absolute inset-0 bg-background p-4 text-destructive text-sm"
          role="alert"
        >
          {error.message}
        </div>
      ) : null}
    </div>
  );
}

async function serializeFetchResponse(response: Response) {
  return {
    body: await response.arrayBuffer(),
    headers: Array.from(response.headers.entries()),
    status: response.status,
    statusText: response.statusText,
    url: response.url,
  };
}

const emptyPresenceSubscribe = () => () => {
  /* No action while this capability is unavailable. */
};
const emptyPresenceSnapshot = () => 0;
