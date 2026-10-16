import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  preparePluginActivation,
  type ResourceCommandItem,
  type ResourceViewDefinition,
  type ResourceViewStatusProps,
} from "@lunarisapp/plugin-sdk";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUpdateV2, Doc, encodeStateAsUpdateV2, XmlText } from "yjs";
import { richTextPlugin } from "./index";

const richTextActivation = await preparePluginActivation(richTextPlugin);

const pendingPromise = new Promise<never>(() => {});

describe("rich-text search indexer", () => {
  it("reads an unnamed Yjs root after applying persisted updates", async () => {
    const resourceType = richTextActivation.contributions.find(
      (contribution) => contribution.type === "resource-type"
    );
    if (!resourceType) {
      throw new Error("Rich text resource was not registered");
    }

    const source = new Doc();
    const target = new Doc();
    source.getXmlFragment().insert(0, [new XmlText("Persisted Yjs text")]);
    applyUpdateV2(target, encodeStateAsUpdateV2(source));

    expect(
      resourceType.schema.read({
        resourceId: "resource-1",
        storage: { content: { document: target, kind: "yjs" } },
      })
    ).toEqual({ "": "Persisted Yjs text" });

    source.destroy();
    target.destroy();
  });

  it("extracts text from the resource payload", async () => {
    const indexer = richTextActivation.contributions.find(
      (contribution) => contribution.type === "search-indexer"
    );
    if (!indexer) {
      throw new Error("Rich text search indexer was not registered");
    }

    expect(
      await indexer.extractText(
        { payload: { default: "<p>Hello searchable world</p>" } } as never,
        { readFile: () => Promise.resolve(null) }
      )
    ).toBe("Hello searchable world");

    expect(
      await indexer.extractText(
        {
          payload: {
            "": "<blockgroup><paragraph>Persisted Yjs text</paragraph></blockgroup>",
          },
        } as never,
        { readFile: () => Promise.resolve(null) }
      )
    ).toBe("Persisted Yjs text");
  });
});

const actionMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  copyMarkdown: vi.fn(() => Promise.resolve()),
  exportMarkdown: vi.fn(() => Promise.resolve()),
  exportPdf: vi.fn(() => Promise.resolve()),
  exportDocx: vi.fn(() => Promise.resolve({ missingImages: 0 })),
  logError: vi.fn(),
  openInChat: vi.fn(() =>
    Promise.resolve({ copiedToClipboard: false, prefilled: true })
  ),
  toastError: vi.fn(),
  toastLoading: vi.fn(() => "pdf-export"),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  translate: vi.fn(
    (_key: string, options: { defaultValue: string }) => options.defaultValue
  ),
}));

const testState = vi.hoisted(() => ({
  isLoading: false,
  plainText: "",
  persistenceListener: null as
    | ((state: "error" | "idle" | "persisting") => void)
    | null,
  persistenceState: "idle" as "error" | "idle" | "persisting",
  suspendEditor: false,
  yDoc: null as object | null,
}));

const yProvider = {
  getPersistenceState: () => testState.persistenceState,
  subscribePersistenceState: (
    listener: (state: "error" | "idle" | "persisting") => void
  ) => {
    testState.persistenceListener = listener;
    listener(testState.persistenceState);
    return () => {
      testState.persistenceListener = null;
    };
  },
  waitForPersistence: () => Promise.resolve(),
};

vi.mock("react-i18next", () => ({
  getI18n: () => ({ t: actionMocks.translate }),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("posthog-js", () => ({
  default: { capture: actionMocks.capture },
}));
vi.mock("evlog", () => ({
  log: { debug: vi.fn(), error: actionMocks.logError },
  parseError: (error: unknown) => error,
}));
vi.mock("sonner", () => ({
  toast: {
    error: actionMocks.toastError,
    loading: actionMocks.toastLoading,
    success: actionMocks.toastSuccess,
    warning: actionMocks.toastWarning,
  },
}));
vi.mock("./export", () => ({
  exportDocumentAsMarkdown: actionMocks.exportMarkdown,
  exportDocumentAsPdf: actionMocks.exportPdf,
  exportResourceAsDocx: actionMocks.exportDocx,
}));
vi.mock("./markdown-actions", () => ({
  copyPageAsMarkdown: actionMocks.copyMarkdown,
  openPageInChat: actionMocks.openInChat,
}));
vi.mock("@lunarisapp/plugin-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lunarisapp/plugin-sdk")>();
  const { lazy } = await import("react");
  return {
    ...actual,
    ViewReady: ({ children }: { children?: ReactNode }) => children,
    createPreloadableLazy: (
      loader: () => Promise<{ default: () => ReactNode }>
    ) => ({ Component: lazy(loader), preload: vi.fn(loader) }),
    useCurrentUser: () => ({
      user: { id: "user-1", name: "Ada" },
      isLoading: false,
    }),
    useYjsAwareness: () => ({ awareness: null, status: "unavailable" }),
    useOrganizationAccess: () => ({
      canDeleteContent: true,
      canWriteContent: true,
    }),
    useYjsStorage: (storage: { storageId: string }) => ({
      documentId: storage.storageId,
      error: null,
      isLoading: testState.isLoading,
      yDoc: testState.yDoc,
      yProvider,
    }),
  };
});
vi.mock("@lunarisapp/plugin-sdk/data", () => ({
  useCurrentWorkspaceYjsDocument: () => ({
    error: null,
    isLoading: testState.isLoading,
    yDoc: testState.yDoc,
    yProvider,
  }),
}));
vi.mock("@lunarisapp/ui/components/panel-error", () => ({
  PanelError: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("./version-history-panel", () => ({
  RichTextVersionHistoryPanel: ({ onClose }: { onClose?: () => void }) => (
    <aside data-testid="version-history-sidebar">
      <button onClick={onClose} type="button">
        close history
      </button>
    </aside>
  ),
}));
vi.mock("./rich-text-editor-inner", () => ({
  RichTextEditorInner: () => {
    if (testState.suspendEditor) {
      throw pendingPromise;
    }

    return <div>editor-ready</div>;
  },
}));
vi.mock("./plain-text", () => ({
  richTextDocToPlainText: vi.fn(() => testState.plainText),
}));

type RegisteredActionContext = {
  resourceReadContext?: unknown;
  documentId?: string;
  resourceId?: string;
  itemName?: string;
  openRightDockPanel: (input: {
    pluginId: string;
    renderer: string;
    titleKey: string;
    params?: Record<string, unknown>;
  }) => void;
  waitForDocumentPersistence?: () => Promise<void>;
};

type RegisteredAction = {
  children?: RegisteredAction[];
  id: string;
  onClick?: (context: RegisteredActionContext) => void;
};

type RegisteredRichTextResource = {
  actions?: RegisteredAction[];
  renderer: (props: { documentId?: string; resourceId?: string }) => ReactNode;
  statusBar?: ResourceViewDefinition["statusBar"];
};

function createYDoc() {
  const fragment = {
    observeDeep: vi.fn(),
    unobserveDeep: vi.fn(),
  };

  return {
    fragment,
    getXmlFragment: vi.fn(() => fragment),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function getRichTextResource() {
  const resource = richTextActivation.contributions.find(
    (contribution) => contribution.type === "resource-type"
  );

  if (!resource) {
    throw new Error("Rich text resource was not registered");
  }
  const view = richTextActivation.contributions.find(
    (contribution) => contribution.type === "view"
  );
  const commands = richTextActivation.contributions.find(
    (contribution) => contribution.type === "resource-command"
  );
  if (view?.target.kind !== "resource") {
    throw new Error("Rich text view was not registered");
  }
  const adaptAction = (action: ResourceCommandItem): RegisteredAction => ({
    ...action,
    children: action.children?.map(adaptAction),
    onClick:
      "onExecute" in action && action.onExecute
        ? (context) =>
            action.onExecute?.({
              resourceReadContext: context.resourceReadContext as never,
              downloadFile: vi.fn(),
              openView: ({ params, titleKey, viewId }) =>
                context.openRightDockPanel({
                  params,
                  pluginId: viewId,
                  renderer: viewId,
                  titleKey,
                }),
              resourceId: context.resourceId ?? "item-1",
              resourceName: context.itemName ?? "Untitled",
              resourceTypeId: "lunaris.rich-text",
              storage: context.documentId
                ? { content: { kind: "yjs", storageId: context.documentId } }
                : {},
              waitForYjsPersistence: () =>
                context.waitForDocumentPersistence?.() ?? Promise.resolve(),
            })
        : undefined,
  });
  return {
    ...resource,
    actions: commands?.commands.map(adaptAction),
    renderer: ({ documentId, resourceId }) =>
      (view as ResourceViewDefinition).renderer({
        params: {},
        resource: {
          parentId: null,
          resourceId: resourceId ?? "item-1",
          resourceTypeId: resource.resourceTypeId,
          schemaId: resource.schema.id,
          schemaVersion: resource.schema.currentVersion,
        },
        storage: documentId
          ? { content: { kind: "yjs", storageId: documentId } }
          : {},
      }),
    statusBar: view.statusBar,
  } satisfies RegisteredRichTextResource;
}

function richTextStatusProps(
  documentId: string | null
): ResourceViewStatusProps {
  return {
    params: {},
    resource: {
      parentId: null,
      resourceId: "item-1",
      resourceTypeId: "lunaris.rich-text",
      schemaId: "lunaris.rich-text.blocknote",
      schemaVersion: 1,
    },
    storage: documentId
      ? { content: { kind: "yjs", storageId: documentId } }
      : {},
  };
}

function renderRichText(opts: {
  isLoading: boolean;
  suspendEditor?: boolean;
  yDoc: object | null;
}) {
  testState.isLoading = opts.isLoading;
  testState.suspendEditor = opts.suspendEditor ?? false;
  testState.yDoc = opts.yDoc;

  const { renderer } = getRichTextResource();

  return render(renderer({ documentId: "doc-1", resourceId: "item-1" }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  testState.isLoading = false;
  testState.plainText = "";
  testState.persistenceListener = null;
  testState.persistenceState = "idle";
  testState.suspendEditor = false;
  testState.yDoc = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rich-text loading state", () => {
  it("shows local skeleton while Yjs document loads", async () => {
    renderRichText({ isLoading: true, yDoc: null });

    expect(await screen.findByTestId("rich-text-skeleton")).toBeTruthy();
    expect(screen.queryByText("editor-ready")).toBeNull();
  });

  it("uses local skeleton for suspense fallback", async () => {
    renderRichText({
      isLoading: false,
      suspendEditor: true,
      yDoc: {},
    });

    expect(await screen.findByTestId("rich-text-skeleton")).toBeTruthy();
    expect(screen.queryByText("editor-ready")).toBeNull();
  });

  it("exposes local persistence state", async () => {
    const { container } = renderRichText({ isLoading: false, yDoc: {} });
    const editor = container.querySelector("[data-yjs-persistence-state]");

    expect(await screen.findByText("editor-ready")).toBeTruthy();
    expect(editor?.getAttribute("data-yjs-persistence-state")).toBe("idle");

    act(() => {
      testState.persistenceState = "persisting";
      testState.persistenceListener?.("persisting");
    });

    expect(editor?.getAttribute("data-yjs-persistence-state")).toBe(
      "persisting"
    );
  });
});

describe("rich-text actions", () => {
  it("registers open, copy, export, and history actions", () => {
    const actions = getRichTextResource().actions;
    const openGroup = actions?.find((action) => action.id === "open-in");
    const exportGroup = actions?.find((action) => action.id === "export-as");

    expect(actions?.map((action) => action.id)).toEqual([
      "open-in",
      "copy-page",
      "export-as",
      "version-history",
    ]);
    expect(openGroup?.children?.map((action) => action.id)).toEqual([
      "open-in-chatgpt",
      "open-in-claude",
    ]);
    expect(exportGroup?.children?.map((action) => action.id)).toEqual([
      "export-pdf",
      "export-docx",
      "export-markdown",
    ]);
  });

  it("waits for persistence before copying Markdown", async () => {
    const action = getRichTextResource().actions?.find(
      (entry) => entry.id === "copy-page"
    );
    const db = {
      getAll: vi.fn(() => Promise.resolve([])),
      getOptional: vi.fn(() => Promise.resolve(null)),
    };
    const persistence = deferred<void>();
    const waitForDocumentPersistence = vi.fn(() => persistence.promise);
    actionMocks.translate.mockReturnValueOnce("Seite als Markdown kopiert");

    action?.onClick?.({
      resourceReadContext: db,
      documentId: "yjs_1",
      openRightDockPanel: vi.fn(),
      waitForDocumentPersistence,
    });

    await vi.waitFor(() => {
      expect(waitForDocumentPersistence).toHaveBeenCalledOnce();
    });
    expect(actionMocks.copyMarkdown).not.toHaveBeenCalled();

    persistence.resolve();

    await vi.waitFor(() => {
      expect(actionMocks.copyMarkdown).toHaveBeenCalledWith(db, "item-1");
      expect(actionMocks.toastSuccess).toHaveBeenCalledWith(
        "Seite als Markdown kopiert"
      );
    });
  });

  it("opens a blank tab before compiling for ChatGPT", async () => {
    const openGroup = getRichTextResource().actions?.find(
      (entry) => entry.id === "open-in"
    );
    const action = openGroup?.children?.find(
      (entry) => entry.id === "open-in-chatgpt"
    );
    const db = {
      getAll: vi.fn(() => Promise.resolve([])),
      getOptional: vi.fn(() => Promise.resolve(null)),
    };
    const targetWindow = {
      close: vi.fn(),
      location: { href: "about:blank" },
      opener: {},
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(targetWindow);

    action?.onClick?.({
      resourceReadContext: db,
      documentId: "yjs_1",
      openRightDockPanel: vi.fn(),
      waitForDocumentPersistence: vi.fn(() => Promise.resolve()),
    });

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(targetWindow.opener).toBeNull();
    await vi.waitFor(() => {
      expect(actionMocks.openInChat).toHaveBeenCalledWith(
        db,
        "item-1",
        "chatgpt",
        targetWindow
      );
    });
  });

  it.each([
    {
      actionId: "export-pdf",
      exportMock: actionMocks.exportPdf,
      format: "pdf",
    },
    {
      actionId: "export-docx",
      exportMock: actionMocks.exportDocx,
      format: "docx",
    },
    {
      actionId: "export-markdown",
      exportMock: actionMocks.exportMarkdown,
      format: "markdown",
    },
  ] as const)(
    "waits for persistence before exporting $format",
    async ({ actionId, exportMock, format }) => {
      const exportGroup = getRichTextResource().actions?.find(
        (entry) => entry.id === "export-as"
      );
      const action = exportGroup?.children?.find(
        (entry) => entry.id === actionId
      );
      const db = {
        getAll: vi.fn(() => Promise.resolve([])),
        getOptional: vi.fn(() => Promise.resolve(null)),
      };
      const persistence = deferred<void>();
      const waitForDocumentPersistence = vi.fn(() => persistence.promise);

      action?.onClick?.({
        resourceReadContext: db,
        documentId: "yjs_1",
        itemName: "Chapter One",
        openRightDockPanel: vi.fn(),
        waitForDocumentPersistence,
      });

      await vi.waitFor(() => {
        expect(waitForDocumentPersistence).toHaveBeenCalledOnce();
      });
      if (format === "markdown") {
        expect(actionMocks.toastLoading).not.toHaveBeenCalled();
      } else {
        expect(actionMocks.toastLoading).toHaveBeenCalledWith(
          `Generating ${format.toUpperCase()}…`
        );
      }
      expect(exportMock).not.toHaveBeenCalled();

      persistence.resolve();

      await vi.waitFor(() => {
        expect(exportMock).toHaveBeenCalledWith(db, "item-1", "Chapter One");
        expect(actionMocks.capture).toHaveBeenCalledWith("rich_text_exported", {
          format,
          success: true,
        });
      });
      if (format !== "markdown") {
        expect(actionMocks.toastSuccess).toHaveBeenCalledWith(
          `${format.toUpperCase()} downloaded`,
          {
            id: "pdf-export",
          }
        );
      }
    }
  );

  it.each(["pdf", "docx"] as const)(
    "reports %s persistence failures without starting export",
    async (format) => {
      const exportGroup = getRichTextResource().actions?.find(
        (entry) => entry.id === "export-as"
      );
      const action = exportGroup?.children?.find(
        (entry) => entry.id === `export-${format}`
      );
      const error = new Error("write failed");

      action?.onClick?.({
        resourceReadContext: {
          getAll: vi.fn(() => Promise.resolve([])),
          getOptional: vi.fn(() => Promise.resolve(null)),
        },
        documentId: "yjs_1",
        itemName: "Chapter One",
        openRightDockPanel: vi.fn(),
        waitForDocumentPersistence: vi.fn(() => Promise.reject(error)),
      });

      await vi.waitFor(() => {
        expect(actionMocks.capture).toHaveBeenCalledWith("rich_text_exported", {
          format,
          success: false,
        });
      });
      expect(actionMocks.exportPdf).not.toHaveBeenCalled();
      expect(actionMocks.exportDocx).not.toHaveBeenCalled();
      expect(actionMocks.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "item-1",
          error,
          format,
        })
      );
      expect(actionMocks.toastError).toHaveBeenCalledWith(
        "Unable to export document",
        { id: "pdf-export" }
      );
    }
  );

  it.each([false, true])(
    "handles DOCX generation outcome (failure=%s)",
    async (failure) => {
      if (failure) {
        actionMocks.exportDocx.mockRejectedValueOnce(
          new Error("Packing failed")
        );
      } else {
        actionMocks.exportDocx.mockResolvedValueOnce({ missingImages: 1 });
      }
      const action = getRichTextResource()
        .actions?.find((entry) => entry.id === "export-as")
        ?.children?.find((entry) => entry.id === "export-docx");
      action?.onClick?.({
        resourceReadContext: {},
        documentId: "yjs_1",
        itemName: "Chapter One",
        openRightDockPanel: vi.fn(),
        waitForDocumentPersistence: () => Promise.resolve(),
      });
      await vi.waitFor(() => {
        expect(actionMocks.capture).toHaveBeenCalledWith("rich_text_exported", {
          format: "docx",
          success: !failure,
        });
        if (failure) {
          expect(actionMocks.toastError).toHaveBeenCalledWith(
            "Unable to export document",
            { id: "pdf-export" }
          );
        } else {
          expect(actionMocks.toastWarning).toHaveBeenCalledWith(
            "DOCX downloaded; some images were unavailable",
            { id: "pdf-export" }
          );
        }
      });
      expect(actionMocks.toastSuccess).not.toHaveBeenCalled();
    }
  );
  it("toggles version history inside the matching rich text panel", async () => {
    renderRichText({ isLoading: false, yDoc: {} });
    const resource = getRichTextResource();
    const action = resource?.actions?.find(
      (entry) => entry.id === "version-history"
    );
    const openRightDockPanel = vi.fn();

    act(() => {
      action?.onClick?.({
        documentId: "doc-1",
        resourceId: "item-1",
        openRightDockPanel,
      });
    });

    expect(await screen.findByTestId("version-history-sidebar")).toBeTruthy();
    expect(openRightDockPanel).not.toHaveBeenCalled();

    act(() => {
      action?.onClick?.({
        documentId: "doc-1",
        resourceId: "item-1",
        openRightDockPanel,
      });
    });

    expect(screen.queryByTestId("version-history-sidebar")).toBeNull();

    act(() => {
      action?.onClick?.({
        documentId: "doc-1",
        resourceId: "item-1",
        openRightDockPanel,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "close history" }));

    expect(screen.queryByTestId("version-history-sidebar")).toBeNull();
  });
});

describe("rich-text statusbar", () => {
  it("registers statusbar content", () => {
    const resource = getRichTextResource();

    expect(resource.statusBar).toBeTypeOf("function");
  });

  it("renders nothing without document id", () => {
    const resource = getRichTextResource();

    render(resource.statusBar?.(richTextStatusProps(null)));

    expect(screen.queryByText(/word/)).toBeNull();
    expect(screen.queryByText(/char/)).toBeNull();
  });

  it("renders nothing while document loads", () => {
    const resource = getRichTextResource();
    testState.isLoading = true;
    testState.yDoc = null;

    render(resource.statusBar?.(richTextStatusProps("doc-1")));

    expect(screen.queryByText(/word/)).toBeNull();
    expect(screen.queryByText(/char/)).toBeNull();
  });

  it("renders nothing when Yjs document is unavailable", () => {
    const resource = getRichTextResource();
    testState.isLoading = false;
    testState.yDoc = null;

    render(resource.statusBar?.(richTextStatusProps("doc-1")));

    expect(screen.queryByText(/word/)).toBeNull();
    expect(screen.queryByText(/char/)).toBeNull();
  });

  it("renders stats from rich text plain text", async () => {
    const resource = getRichTextResource();
    testState.plainText = "Hello world";
    testState.yDoc = createYDoc();

    render(resource.statusBar?.(richTextStatusProps("doc-1")));

    expect(await screen.findByText("2 words")).toBeTruthy();
    expect(await screen.findByText("10 chars")).toBeTruthy();
  });

  it("renders singular stat labels", async () => {
    const resource = getRichTextResource();
    testState.plainText = "A";
    testState.yDoc = createYDoc();

    render(resource.statusBar?.(richTextStatusProps("doc-1")));

    expect(await screen.findByText("1 word")).toBeTruthy();
    expect(await screen.findByText("1 char")).toBeTruthy();
  });

  it("unmounts when idle cancellation is unavailable", () => {
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelIdleCallback", undefined);
    const resource = getRichTextResource();
    testState.yDoc = createYDoc();

    const view = render(resource.statusBar?.(richTextStatusProps("doc-1")));

    expect(() => view.unmount()).not.toThrow();
  });

  it("debounces stat recalculation after edits", async () => {
    vi.useFakeTimers();
    const resource = getRichTextResource();
    const yDoc = createYDoc();
    testState.plainText = "Hello world";
    testState.yDoc = yDoc;

    render(resource.statusBar?.(richTextStatusProps("doc-1")));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("2 words")).toBeTruthy();

    testState.plainText = "Hello brave new world";
    const update = yDoc.fragment.observeDeep.mock.calls[0]?.[0];
    act(() => update?.());
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(screen.queryByText("4 words")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("4 words")).toBeTruthy();
  });
});
