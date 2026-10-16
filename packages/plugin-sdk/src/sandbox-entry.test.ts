// @vitest-environment happy-dom

import { createHash } from "node:crypto";
import { waitFor } from "@testing-library/react";
import {
  createElement,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { applyUpdateV2, Doc, encodeStateAsUpdateV2 } from "yjs";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import type { PluginYjsProvider } from "./data-adapter";
import type { ResourceStorageHandle } from "./types";
import {
  useWorkspaceKeyValue,
  useYjsStorage,
  useYMapField,
} from "./data-hooks";
import { definePlugin } from "./definition";
import {
  useFileStorage,
  usePluginFetch,
  useStoredFile,
  useYjsStorageLastEdited,
} from "./runtime-context";
import { installExternalPluginSandboxRuntime } from "./sandbox-entry";
import {
  PLUGIN_SANDBOX_BOOTSTRAP_CSP,
  PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
  type SandboxPluginMessage,
} from "./sandbox-protocol";

describe("sandbox bundle runtime", () => {
  it("pins the opaque-origin bootstrap in CSP", () => {
    const digest = createHash("sha256")
      .update(PLUGIN_SANDBOX_BOOTSTRAP_SOURCE)
      .digest("base64");
    expect(PLUGIN_SANDBOX_BOOTSTRAP_CSP).toBe(`'sha256-${digest}'`);
  });

  it("renders with storage, reconstructed fetch, and a Yjs replica", async () => {
    function LoadedFixture({
      yDoc,
      yProvider,
    }: {
      yDoc: Doc;
      yProvider: PluginYjsProvider;
    }) {
      const fileHandle = {
        kind: "file" as const,
        storageId: "file-1",
      } as ResourceStorageHandle;
      const storedFile = useStoredFile(fileHandle);
      const contentLastEdited = useYjsStorageLastEdited({
        kind: "yjs",
        storageId: "content-1",
      });
      const secondaryLastEdited = useYjsStorageLastEdited({
        kind: "yjs",
        storageId: "content-2",
      });
      const fileStorage = useFileStorage();
      const pluginFetch = usePluginFetch();
      const uploadStarted = useRef(false);
      const stored = useWorkspaceKeyValue<string>(
        { kind: "key-value", storageId: "example.sandbox.settings" },
        "greeting"
      );
      const [title, setTitle] = useYMapField(
        yDoc.getMap<string>("metadata"),
        "title"
      );
      const persistenceState = useSyncExternalStore(
        yProvider.subscribePersistenceState,
        yProvider.getPersistenceState,
        yProvider.getPersistenceState
      );
      const [responseText, setResponseText] = useState("loading");
      useEffect(() => {
        void pluginFetch(
          new Request("https://example.com/data", {
            body: "request-body",
            headers: { "x-plugin": "sandbox" },
            method: "POST",
          })
        )
          .then((response) => response.text())
          .then(setResponseText)
          .catch((error: Error) => {
            // A replacement renderer may hydrate immediately from the shared
            // Y.Doc and start a request just before the sandbox is disposed.
            if (error.message !== "Extension sandbox disposed") {
              throw error;
            }
          });
      }, [pluginFetch]);
      useEffect(() => {
        if (title === "host") {
          setTitle("sandbox");
        }
      }, [setTitle, title]);
      useEffect(() => {
        if (uploadStarted.current) {
          return;
        }
        uploadStarted.current = true;
        void fileStorage
          .upload({
            file: new File(["<h1>Sandbox app</h1>"], "app.html", {
              type: "text/html",
            }),
            storage: fileHandle,
          })
          .catch((error: Error) => {
            if (error.message !== "Extension sandbox disposed") {
              throw error;
            }
          });
      }, [fileStorage.upload, fileHandle]);
      return createElement(
        "div",
        { id: "fixture-result" },
        `${stored.value}|${title}|${responseText}|${storedFile.metadata?.fileId}|${storedFile.metadata?.filename}|${storedFile.objectUrl ? "blob" : "missing"}|${persistenceState}|${contentLastEdited.lastEditedAt?.toISOString()}|${secondaryLastEdited.isLoading}`
      );
    }

    function Fixture({
      reportReady,
    }: {
      params: Record<string, unknown>;
      reportReady?: () => void;
    }) {
      useEffect(() => reportReady?.(), [reportReady]);
      const ready = useYjsStorage(
        { kind: "yjs", storageId: "content-1" } as ResourceStorageHandle,
        "workspace-1"
      );
      if (ready.isLoading || !ready.yDoc || !ready.yProvider) {
        return createElement("div", { id: "fixture-result" }, "loading");
      }
      return createElement(LoadedFixture, {
        yDoc: ready.yDoc,
        yProvider: ready.yProvider,
      });
    }

    const effectCleanup = vi.fn();
    const activationCleanup = vi.fn();
    const plugin = definePlugin({
      manifest: {
        description: "Sandbox",
        developer: "Example",
        id: "example.sandbox",
        name: "Sandbox",
        api: "^0.9.0",
        permissions: [
          "content.read",
          "content.write",
          "files.read",
          "files.write",
          "network.https",
        ],
        version: "1.0.0",
      },
      activate({ contributions, effects }) {
        contributions.workspaceStorage({
          kind: "key-value",
          storageId: "example.sandbox.settings",
        });
        contributions.view({
          icon: [["path", { d: "M4 4h16v16H4z" }]],
          viewId: "example.sandbox",
          name: "Sandbox",
          renderer: Fixture,
          target: {
            kind: "standalone",
            launcher: { defaultPlacement: "primary" },
          },
        });
        contributions.searchIndexer({
          extractText: async (input, context) => {
            const file = await context.readFile(input.storage.cover!);
            return file ? new TextDecoder().decode(file.bytes) : null;
          },
          id: "example.sandbox.search-indexer",
          resourceTypeIds: ["example.sandbox.srcdoc"],
        });
        contributions.searchQuery({
          id: "example.sandbox.search-query",
          open: (_result, context) => {
            context.openView({
              titleKey: "sandbox.title",
              viewId: "example.sandbox",
            });
          },
          query: async () => ({ items: [], nextCursor: null }),
        });
        contributions.resourceType({
          createInWorkspace: ({ createResource }) =>
            createResource({ name: "Created" }),
          defaultViewId: "example.sandbox.srcdoc.view",
          icon: [["path", { d: "M4 4h16v16H4z" }]],
          name: "Srcdoc",
          resourceTypeId: "example.sandbox.srcdoc",
          schema: {
            currentVersion: 1,
            id: "example.sandbox.srcdoc.schema",
            read: ({ storage }) => ({
              title:
                storage.content?.kind === "yjs"
                  ? storage.content.document.getMap("metadata").get("title")
                  : undefined,
            }),
            versions: { 1: z.object({ title: z.string() }) },
            write: (payload, { storage }) => {
              if (storage.content?.kind !== "yjs") {
                return;
              }
              storage.content.document
                .getMap("metadata")
                .set("title", (payload as { title: string }).title);
            },
          },
          storage: { content: { kind: "yjs" } },
        });
        contributions.view({
          icon: [["path", { d: "M4 4h16v16H4z" }]],
          viewId: "example.sandbox.srcdoc.view",
          name: "Srcdoc",
          renderer: Fixture,
          rendererSandbox: "local-srcdoc",
          statusBar: () => createElement("span", null, "Ready"),
          storageRequirements: { content: "yjs" },
          target: {
            kind: "resource",
            resourceTypeIds: ["example.sandbox.srcdoc"],
          },
        });
        effects.add(() => effectCleanup);
        return activationCleanup;
      },
    });
    const registration = installExternalPluginSandboxRuntime().register(
      "example.sandbox",
      plugin
    );
    await expect(registration).resolves.toEqual({});
    const channel = new MessageChannel();
    const hostDoc = new Doc();
    hostDoc.getMap("metadata").set("title", "host");
    let resolveRegistered: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveActivated: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveReady: () => void = () => undefined;
    let resolveCreated: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolvePayloadRead: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolvePayloadWrite: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveSearchIndex: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveSearchQuery: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveSearchOpen: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveRendererReady: () => void = () => undefined;
    let resolveYjs: () => void = () => undefined;
    let resolveUnknownFailure: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveMalformedFailure: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let resolveDisposed: (message: SandboxPluginMessage) => void = () =>
      undefined;
    let fetchArguments: unknown[] | undefined;
    let createItemArguments: unknown[] | undefined;
    let uploadArguments: unknown[] | undefined;
    let yjsApplyCalls = 0;
    let resolveUpload: () => void = () => undefined;
    const registered = new Promise<SandboxPluginMessage>((resolve) => {
      resolveRegistered = resolve;
    });
    const activated = new Promise<SandboxPluginMessage>((resolve) => {
      resolveActivated = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const created = new Promise<SandboxPluginMessage>((resolve) => {
      resolveCreated = resolve;
    });
    const payloadRead = new Promise<SandboxPluginMessage>((resolve) => {
      resolvePayloadRead = resolve;
    });
    const payloadWrite = new Promise<SandboxPluginMessage>((resolve) => {
      resolvePayloadWrite = resolve;
    });
    const searchIndex = new Promise<SandboxPluginMessage>((resolve) => {
      resolveSearchIndex = resolve;
    });
    const searchQuery = new Promise<SandboxPluginMessage>((resolve) => {
      resolveSearchQuery = resolve;
    });
    const searchOpen = new Promise<SandboxPluginMessage>((resolve) => {
      resolveSearchOpen = resolve;
    });
    const rendererReady = new Promise<void>((resolve) => {
      resolveRendererReady = resolve;
    });
    const yjsUpdated = new Promise<void>((resolve) => {
      resolveYjs = resolve;
    });
    const unknownFailure = new Promise<SandboxPluginMessage>((resolve) => {
      resolveUnknownFailure = resolve;
    });
    const malformedFailure = new Promise<SandboxPluginMessage>((resolve) => {
      resolveMalformedFailure = resolve;
    });
    const disposed = new Promise<SandboxPluginMessage>((resolve) => {
      resolveDisposed = resolve;
    });
    const uploaded = new Promise<void>((resolve) => {
      resolveUpload = resolve;
    });
    channel.port1.onmessage = (event: MessageEvent<SandboxPluginMessage>) => {
      const message = event.data;
      if (message.type === "registered") {
        resolveRegistered(message);
      }
      if (message.type === "ready" && message.id === "render-1") {
        resolveReady();
      }
      if (message.type === "ready" && message.id === "activate-1") {
        resolveActivated(message);
      }
      if (message.type === "result" && message.id === "create-1") {
        resolveCreated(message);
      }
      if (message.type === "result" && message.id === "payload-read-1") {
        resolvePayloadRead(message);
      }
      if (message.type === "result" && message.id === "payload-write-1") {
        resolvePayloadWrite(message);
      }
      if (message.type === "result" && message.id === "search-index-1") {
        resolveSearchIndex(message);
      }
      if (message.type === "result" && message.id === "search-query-1") {
        resolveSearchQuery(message);
      }
      if (message.type === "result" && message.id === "search-open-1") {
        resolveSearchOpen(message);
      }
      if (message.type === "failure" && message.id === "unknown-1") {
        resolveUnknownFailure(message);
      }
      if (message.type === "failure" && message.id === "malformed-1") {
        resolveMalformedFailure(message);
      }
      if (message.type === "ready" && message.id === "dispose-1") {
        resolveDisposed(message);
      }
      if (message.type !== "host-call") {
        return;
      }
      if (message.method === "renderer.reportReady") {
        resolveRendererReady();
        channel.port1.postMessage({ id: message.id, type: "host-result" });
      }
      if (message.method === "plugin.fetch") {
        fetchArguments = message.args;
        const bytes = new TextEncoder().encode("approved");
        channel.port1.postMessage({
          id: message.id,
          type: "host-result",
          value: {
            body: bytes.buffer,
            headers: [["content-type", "text/plain"]],
            status: 200,
            statusText: "OK",
          },
        });
      }
      if (message.method === "attachment.upload") {
        uploadArguments = message.args;
        resolveUpload();
        channel.port1.postMessage({
          id: message.id,
          type: "host-result",
          value: {
            attachmentId: "att-1",
            fileExtension: "html",
            filename: "app.html",
            mediaType: "text/html",
            size: 20,
            uploadedAt: "2026-08-14T00:00:00.000Z",
          },
        });
      }
      if (message.method === "resourceCreation.createResource") {
        createItemArguments = message.args;
        channel.port1.postMessage({
          id: message.id,
          type: "host-result",
          value: {
            name: "Created",
            resourceId: "created-item",
            storage: { content: { kind: "yjs", storageId: "created-content" } },
          },
        });
      }
      if (message.method === "searchIndexer.readFile") {
        channel.port1.postMessage({
          id: message.id,
          type: "host-result",
          value: {
            bytes: new TextEncoder().encode("sandbox indexed text").buffer,
            mediaType: "text/plain",
          },
        });
      }
      if (message.method === "searchQuery.openView") {
        channel.port1.postMessage({ id: message.id, type: "host-result" });
      }
      if (message.method === "yjs.applyUpdate") {
        yjsApplyCalls += 1;
        const update = message.args[1];
        if (update instanceof ArrayBuffer) {
          applyUpdateV2(hostDoc, new Uint8Array(update));
          resolveYjs();
        }
        channel.port1.postMessage({ id: message.id, type: "host-result" });
      }
    };
    channel.port1.start();
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          pluginId: "example.sandbox",
          type: "lunaris-plugin-sandbox-connect",
        },
        ports: [channel.port2],
      })
    );

    await expect(registered).resolves.toMatchObject({
      definition: {
        manifest: { id: "example.sandbox" },
        contributions: expect.arrayContaining([
          expect.objectContaining({
            createHandler: "create:example.sandbox.srcdoc:default",
            resourceTypeId: "example.sandbox.srcdoc",
            type: "resource-type",
          }),
          expect.objectContaining({
            handler: "search-indexer:example.sandbox.search-indexer:default",
            type: "search-indexer",
          }),
          expect.objectContaining({
            openHandler:
              "search-query-open:example.sandbox.search-query:default",
            queryHandler: "search-query:example.sandbox.search-query:default",
            type: "search-query",
          }),
          expect.objectContaining({
            rendererSandbox: "local-srcdoc",
            statusBar: "status-bar:example.sandbox.srcdoc.view:default",
            type: "view",
            viewId: "example.sandbox.srcdoc.view",
          }),
        ]),
      },
      protocol: 7,
      type: "registered",
    });
    channel.port1.postMessage({ id: "activate-1", type: "activate" });
    await expect(activated).resolves.toMatchObject({
      id: "activate-1",
      type: "ready",
    });
    channel.port1.postMessage({
      handler: "search-indexer:example.sandbox.search-indexer:default",
      id: "search-index-1",
      input: {
        payload: {},
        resource: {
          parentId: null,
          resourceId: "resource-1",
          resourceTypeId: "example.sandbox.srcdoc",
          schemaId: "example.sandbox.srcdoc.schema",
          schemaVersion: 1,
        },
        storage: { cover: { kind: "file", storageId: "cover-1" } },
      },
      type: "invoke",
    });
    await expect(searchIndex).resolves.toMatchObject({
      id: "search-index-1",
      type: "result",
      value: "sandbox indexed text",
    });
    channel.port1.postMessage({
      handler: "search-query:example.sandbox.search-query:default",
      id: "search-query-1",
      input: { limit: 10, text: "sandbox" },
      type: "invoke",
    });
    await expect(searchQuery).resolves.toMatchObject({
      id: "search-query-1",
      type: "result",
      value: { items: [], nextCursor: null },
    });
    channel.port1.postMessage({
      handler: "search-query-open:example.sandbox.search-query:default",
      id: "search-open-1",
      input: { id: "result-1", label: "Result" },
      type: "invoke",
    });
    await expect(searchOpen).resolves.toMatchObject({
      id: "search-open-1",
      type: "result",
    });
    channel.port1.postMessage({
      handler: "create:example.sandbox.srcdoc:default",
      id: "create-1",
      input: { parentId: "root" },
      type: "invoke",
    });
    await expect(created).resolves.toMatchObject({
      id: "create-1",
      type: "result",
      value: {
        name: "Created",
        resourceId: "created-item",
        storage: { content: { kind: "yjs", storageId: "created-content" } },
      },
    });
    expect(createItemArguments).toEqual([{ name: "Created" }]);
    const payloadDoc = new Doc();
    payloadDoc.getMap("metadata").set("title", "stored");
    const payloadDocumentUpdate = encodeStateAsUpdateV2(payloadDoc).buffer;
    channel.port1.postMessage({
      handler: "payload-read:example.sandbox.srcdoc:default",
      id: "payload-read-1",
      input: {
        resourceId: "payload-resource",
        storage: {
          content: { kind: "yjs", documentUpdate: payloadDocumentUpdate },
        },
      },
      type: "invoke",
    });
    await expect(payloadRead).resolves.toMatchObject({
      id: "payload-read-1",
      type: "result",
      value: { title: "stored" },
    });
    channel.port1.postMessage({
      handler: "payload-write:example.sandbox.srcdoc:default",
      id: "payload-write-1",
      input: {
        context: {
          resourceId: "payload-resource",
          storage: {
            content: { kind: "yjs", documentUpdate: payloadDocumentUpdate },
          },
        },
        payload: { title: "migrated" },
      },
      type: "invoke",
    });
    const payloadWriteResult = await payloadWrite;
    expect(payloadWriteResult).toMatchObject({
      id: "payload-write-1",
      type: "result",
      value: {
        content: { documentUpdate: expect.any(ArrayBuffer), kind: "yjs" },
      },
    });
    if (payloadWriteResult.type !== "result") {
      throw new Error("Payload write did not return a result");
    }
    applyUpdateV2(
      payloadDoc,
      new Uint8Array((payloadWriteResult.value as any).content.documentUpdate)
    );
    expect(payloadDoc.getMap("metadata").get("title")).toBe("migrated");
    payloadDoc.destroy();
    const initialUpdate = encodeStateAsUpdateV2(hostDoc);
    const host = {
      currentWorkspace: {
        workspace: { id: "workspace-1", name: "Workspace" },
        workspaceId: "workspace-1",
      },
      currentUser: { isLoading: false, user: { id: "user-1" } },
      lastEdited: [
        {
          storageId: "content-1",
          isLoading: false,
          lastEditedAt: "2026-08-27T10:00:00.000Z",
        },
        { storageId: "content-2", isLoading: true, lastEditedAt: null },
      ],
      attachments: [
        {
          attachment: {
            hasSynced: true,
            id: "att-1",
            localUri: "local://app.html",
            mediaType: "text/html",
            status: "synced",
          },
          bytes: new TextEncoder().encode("<h1>Stored app</h1>").buffer,
          storageId: "file-1",
          mediaType: "text/html",
          metadata: {
            attachmentId: "att-1",
            fileExtension: "html",
            filename: "stored.html",
            mediaType: "text/html",
            size: 19,
            uploadedAt: "2026-08-14T00:00:00.000Z",
          },
        },
      ],
      storage: {
        slots: {
          "example.sandbox:example.sandbox.settings": {
            isFetching: false,
            isLoading: false,
            items: [["greeting", "stored"]],
          },
        },
      },
      yjs: [
        {
          storageId: "content-1",
          persistenceState: "idle",
          workspaceId: "workspace-1",
        },
      ],
    };
    channel.port1.postMessage({
      host: {
        ...host,
        environment: {
          colorScheme: "dark",
          cssVariables: { "--background": "#191817" },
        },
      },
      id: "render-1",
      params: {},
      renderer: "renderer:example.sandbox:default",
      type: "render",
    });
    await ready;
    expect(document.querySelector("#fixture-result")?.textContent).toBe(
      "loading"
    );
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(
      document.documentElement.style.getPropertyValue("--background")
    ).toBe("#191817");
    expect(yjsApplyCalls).toBe(0);

    channel.port1.postMessage({
      host: {
        ...host,
        yjs: [
          {
            ...host.yjs[0],
            update: initialUpdate.buffer.slice(
              initialUpdate.byteOffset,
              initialUpdate.byteOffset + initialUpdate.byteLength
            ),
          },
        ],
      },
      id: "render-1",
      type: "snapshot",
    });
    await yjsUpdated;
    await uploaded;
    await waitFor(() =>
      expect(document.querySelector("#fixture-result")?.textContent).toBe(
        "stored|sandbox|approved|att-1|stored.html|blob|idle|2026-08-27T10:00:00.000Z|true"
      )
    );
    channel.port1.postMessage({
      host: {
        ...host,
        yjs: [
          {
            ...host.yjs[0],
            persistenceState: "persisting",
            update: encodeStateAsUpdateV2(hostDoc).buffer,
          },
        ],
      },
      id: "render-1",
      type: "snapshot",
    });
    await waitFor(() =>
      expect(document.querySelector("#fixture-result")?.textContent).toBe(
        "stored|sandbox|approved|att-1|stored.html|blob|persisting|2026-08-27T10:00:00.000Z|true"
      )
    );
    expect(hostDoc.getMap("metadata").get("title")).toBe("sandbox");
    expect(fetchArguments).toMatchObject([
      "https://example.com/data",
      {
        method: "POST",
      },
    ]);
    expect(
      new Headers(
        (fetchArguments![1] as { headers: [string, string][] }).headers
      ).get("x-plugin")
    ).toBe("sandbox");
    expect(
      new TextDecoder().decode(
        (fetchArguments![1] as { body: ArrayBuffer }).body
      )
    ).toBe("request-body");
    expect(uploadArguments?.[0]).toMatchObject({
      filename: "app.html",
      storageId: "file-1",
      mediaType: "text/html",
    });
    expect(
      new TextDecoder().decode(
        (uploadArguments![0] as { bytes: ArrayBuffer }).bytes
      )
    ).toBe("<h1>Sandbox app</h1>");
    expect(document.querySelector("iframe")).toBeNull();
    channel.port1.postMessage({
      host: {
        ...host,
        yjs: [
          {
            ...host.yjs[0],
            update: encodeStateAsUpdateV2(hostDoc).buffer,
          },
        ],
      },
      id: "render-ready-1",
      params: {
        params: {},
        resource: {
          parentId: null,
          resourceId: "payload-resource",
          resourceTypeId: "example.sandbox.srcdoc",
          schemaId: "example.sandbox.srcdoc.schema",
          schemaVersion: 1,
        },
        storage: { content: { kind: "yjs", storageId: "content-1" } },
      },
      renderer: "renderer:example.sandbox.srcdoc.view:default",
      type: "render",
    });
    await rendererReady;
    channel.port1.postMessage({
      handler: "unknown:handler",
      id: "unknown-1",
      type: "invoke",
    });
    await expect(unknownFailure).resolves.toMatchObject({
      error: { message: "Unknown handler: unknown:handler", name: "Error" },
      id: "unknown-1",
      type: "failure",
    });
    channel.port1.postMessage({
      handler: "unknown:handler",
      id: "malformed-1",
      input: new Date(),
      type: "invoke",
    });
    await expect(malformedFailure).resolves.toMatchObject({
      error: {
        message: expect.stringContaining("structured-clone-safe JSON"),
        name: "Error",
      },
      id: "malformed-1",
      type: "failure",
    });
    expect(() =>
      installExternalPluginSandboxRuntime().register(
        "example.duplicate",
        plugin
      )
    ).toThrow("Duplicate extension registration");
    expect(effectCleanup).not.toHaveBeenCalled();
    expect(activationCleanup).not.toHaveBeenCalled();
    channel.port1.postMessage({ id: "dispose-1", type: "dispose" });
    await expect(disposed).resolves.toMatchObject({
      id: "dispose-1",
      type: "ready",
    });
    expect(effectCleanup).toHaveBeenCalledOnce();
    expect(activationCleanup).toHaveBeenCalledOnce();
    channel.port1.close();
    hostDoc.destroy();
    root.remove();
  });
});
