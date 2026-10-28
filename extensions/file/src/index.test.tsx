import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { logErrorMock, toastErrorMock } = vi.hoisted(() => ({
  logErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

interface FileTestRow {
  fileExtension?: string;
  filename?: string;
  localUri?: string | null;
  mediaType: string;
  state: number;
}

async function loadResource(opts: {
  afterWatchYield?: (index: number) => Promise<void> | void;
  fileExtension?: string;
  filename?: string;
  localUri?: string | null;
  mediaType: string;
  readFile?: (fileUri: string) => Promise<ArrayBuffer>;
  readReject?: boolean;
  state: number;
  watchRows?: FileTestRow[];
}) {
  vi.resetModules();
  vi.doMock("@lunarisapp/plugin-sdk", async (importOriginal) => {
    const actual =
      await importOriginal<typeof import("@lunarisapp/plugin-sdk")>();
    const React = await import("react");
    function useStoredFile() {
      const [index, setIndex] = React.useState(0);
      const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
      const currentUrlRef = React.useRef<string | null>(null);
      const rows = opts.watchRows ?? [
        {
          fileExtension: opts.fileExtension,
          filename: opts.filename,
          localUri: opts.localUri,
          mediaType: opts.mediaType,
          state: opts.state,
        },
      ];
      const row = rows[Math.min(index, rows.length - 1)]!;
      const metadata = {
        fileId: "att_1",
        fileExtension:
          row.fileExtension ??
          (row.mediaType === "application/pdf" ? "pdf" : "png"),
        filename:
          row.filename ??
          (row.mediaType === "application/pdf" ? "doc.pdf" : "image.png"),
        mediaType: row.mediaType,
        size: 10,
        uploadedAt: "2026-01-01T00:00:00.000Z",
      };

      React.useEffect(() => {
        let cancelled = false;
        async function load() {
          if (!row.localUri) {
            if (currentUrlRef.current) {
              URL.revokeObjectURL(currentUrlRef.current);
              currentUrlRef.current = null;
            }
            setObjectUrl(null);
            return;
          }
          try {
            const buffer = opts.readFile
              ? await opts.readFile(row.localUri)
              : opts.readReject
                ? await Promise.reject(new Error("missing bytes"))
                : new ArrayBuffer(1);
            if (cancelled) {
              return;
            }
            const previousUrl = currentUrlRef.current;
            const nextUrl = URL.createObjectURL(
              new Blob([buffer], { type: row.mediaType })
            );
            currentUrlRef.current = nextUrl;
            setObjectUrl(nextUrl);
            if (previousUrl) {
              URL.revokeObjectURL(previousUrl);
            }
          } catch (error) {
            logErrorMock({
              attachmentId: "att_1",
              error,
              resourceId: "item_1",
              msg: "failed to load local attachment preview",
              workspaceId: "workspace_1",
              tag: "AttachmentStorage",
            });
            setObjectUrl(null);
          }
        }
        void load();
        return () => {
          cancelled = true;
        };
      }, [row.localUri, row.mediaType]);

      React.useEffect(
        () => () => {
          if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
            currentUrlRef.current = null;
          }
        },
        []
      );

      React.useEffect(() => {
        if (!opts.afterWatchYield || index >= rows.length - 1) {
          return;
        }
        let cancelled = false;
        void Promise.resolve(opts.afterWatchYield(index)).then(() => {
          if (!cancelled) {
            setIndex((value) => value + 1);
          }
        });
        return () => {
          cancelled = true;
        };
      }, [index, rows.length]);

      return {
        file: {
          hasSynced: true,
          id: "att_1",
          localUri: row.localUri ?? null,
          mediaType: row.mediaType,
          status:
            row.state === 1
              ? "queued-download"
              : row.state === 3
                ? "synced"
                : "unknown",
        },
        metadata,
        objectUrl,
      };
    }
    return {
      ...actual,
      useCurrentWorkspace: () => ({ workspaceId: "workspace_1" }),
      useStoredFile,
      definePlugin: (input: unknown) => input,
    };
  });
  vi.doMock("@uiw/react-json-view", () => ({
    default: ({ value }: { value: unknown }) => (
      <div data-testid="json-view">{JSON.stringify(value)}</div>
    ),
  }));
  vi.doMock("@uiw/react-json-view/dark", () => ({
    darkTheme: {},
  }));
  vi.doMock("@uiw/react-json-view/light", () => ({
    lightTheme: {},
  }));
  vi.doMock("next-themes", () => ({
    useTheme: () => ({ resolvedTheme: "light", theme: "light" }),
  }));
  vi.doMock("./components/extend/csv-viewer", () => ({
    CsvViewer: ({
      data,
      fileName,
      search,
      showUpload,
    }: {
      data?: string;
      fileName?: string;
      search?: boolean;
      showUpload?: boolean;
    }) => (
      <div
        data-content={data}
        data-file-name={fileName}
        data-search={String(search)}
        data-show-upload={String(showUpload)}
        data-testid="extend-csv-viewer"
      />
    ),
  }));
  vi.doMock("./components/extend/docx-viewer", () => ({
    DocxViewerPreview: ({
      fileName,
      isDark,
      showFileActionsMenu,
      showUpload,
      src,
    }: {
      fileName?: string;
      isDark?: boolean;
      showFileActionsMenu?: boolean;
      showUpload?: boolean;
      src?: string;
    }) => (
      <div
        data-file-name={fileName}
        data-is-dark={String(isDark)}
        data-show-file-actions-menu={String(showFileActionsMenu)}
        data-show-upload={String(showUpload)}
        data-src={src}
        data-testid="extend-docx-viewer"
      />
    ),
  }));
  vi.doMock("./components/extend/pdf-viewer", () => ({
    PDFViewer: ({
      fileName,
      showUpload,
      src,
    }: {
      fileName?: string;
      showUpload?: boolean;
      src?: string;
    }) => (
      <div
        data-file-name={fileName}
        data-show-upload={String(showUpload)}
        data-src={src}
        data-testid="extend-pdf-viewer"
      />
    ),
  }));
  vi.doMock("./components/extend/pptx-viewer", () => ({
    PptxViewerPreview: ({
      fileName,
      showUpload,
      src,
    }: {
      fileName?: string;
      showUpload?: boolean;
      src?: string;
    }) => (
      <div
        data-file-name={fileName}
        data-show-upload={String(showUpload)}
        data-src={src}
        data-testid="extend-pptx-viewer"
      />
    ),
  }));
  vi.doMock("./components/extend/xlsx-viewer", () => ({
    XlsxViewerPreview: ({
      fileName,
      showUpload,
      src,
    }: {
      fileName?: string;
      showUpload?: boolean;
      src?: string;
    }) => (
      <div
        data-file-name={fileName}
        data-show-upload={String(showUpload)}
        data-src={src}
        data-testid="extend-xlsx-viewer"
      />
    ),
  }));
  vi.doMock("react-xml-viewer", () => ({
    default: ({ xml }: { xml: string }) => (
      <div data-testid="xml-view">{xml}</div>
    ),
  }));
  vi.doMock("@powersync/web", () => ({
    AttachmentState: { QUEUED_DOWNLOAD: 1, SYNCED: 3 },
    IndexDBFileSystemStorageAdapter: class {
      initialize() {
        return Promise.resolve();
      }
      readFile(fileUri: string) {
        if (opts.readFile) {
          return opts.readFile(fileUri);
        }
        if (opts.readReject) {
          return Promise.reject(new Error("missing bytes"));
        }
        return Promise.resolve(new ArrayBuffer(1));
      }
    },
  }));
  vi.doMock("@lunarisapp/ui/components/panel-error", () => ({
    PanelError: ({
      actions,
      description,
      title,
    }: {
      actions?: ReactNode;
      description?: string;
      title: string;
    }) => (
      <div>
        <div>{title}</div>
        {description ? <div>{description}</div> : null}
        {actions}
      </div>
    ),
  }));
  vi.doMock("react-i18next", () => ({
    useTranslation: () => ({
      t: (key: string, values?: { fileType?: string }) =>
        values?.fileType ? `${key}:${values.fileType}` : key,
    }),
  }));
  vi.doMock("evlog", async (importOriginal) => {
    const actual = await importOriginal<typeof import("evlog")>();
    return {
      ...actual,
      log: { ...actual.log, error: logErrorMock },
      parseError: (e: unknown) => e,
    };
  });
  vi.doMock("sonner", () => ({
    toast: { error: toastErrorMock },
  }));

  const { filePlugin } = await import("./index");
  const { preparePluginActivation } = await import("@lunarisapp/plugin-sdk");
  type ResourceViewDefinition =
    import("@lunarisapp/plugin-sdk").ResourceViewDefinition;
  const activation = await preparePluginActivation(filePlugin);
  const resource = activation.contributions.find(
    (contribution) => contribution.type === "resource-type"
  );
  const view = activation.contributions.find(
    (contribution) => contribution.type === "view"
  );
  const command = activation.contributions.find(
    (contribution) => contribution.type === "resource-command"
  );
  const indexer = activation.contributions.find(
    (contribution) => contribution.type === "search-indexer"
  );
  if (
    resource?.type !== "resource-type" ||
    view?.type !== "view" ||
    view.target.kind !== "resource"
  ) {
    return;
  }
  return {
    ...resource,
    commands: command?.type === "resource-command" ? command.commands : [],
    extractText:
      indexer?.type === "search-indexer" ? indexer.extractText : undefined,
    renderer: (props: { resourceId?: string; reportReady?: () => void }) =>
      (view as unknown as ResourceViewDefinition).renderer({
        params: {},
        resource: {
          parentId: null,
          resourceId: props.resourceId ?? "item_1",
          resourceTypeId: "lunaris.file",
          schemaId: "lunaris.file.metadata",
          schemaVersion: 1,
        },
        storage: {
          content: {
            kind: "file",
            storageId: `file:${props.resourceId ?? "item_1"}`,
          },
        },
        reportReady: props.reportReady ?? (() => undefined),
      }),
  } as unknown as {
    commands: readonly {
      id: string;
      onExecute: (context: Record<string, unknown>) => void;
    }[];
    createInWorkspace?: (context: {
      createResource: (input?: { name?: string }) => Promise<{
        name: string;
        resourceId: string;
        storage: { content: { kind: "file"; storageId: string } };
      }>;
      deleteResource: (resourceId: string) => Promise<void>;
      parentId: string;
      uploadFile: (input: {
        file: File;
        storage: { kind: "file"; storageId: string };
      }) => Promise<unknown>;
    }) => Promise<unknown>;
    storage: { content: { kind: string } };
    renderer: (props: {
      resourceId?: string;
      reportReady?: () => void;
    }) => ReactNode;
    extractText?: (
      input: unknown,
      context: {
        readFile: () => Promise<{
          bytes: ArrayBuffer;
          mediaType: string | null;
        } | null>;
      }
    ) => Promise<string | null> | string | null;
  };
}

async function loadRenderer(opts: {
  afterWatchYield?: (index: number) => Promise<void> | void;
  fileExtension?: string;
  filename?: string;
  localUri?: string | null;
  mediaType: string;
  readFile?: (fileUri: string) => Promise<ArrayBuffer>;
  readReject?: boolean;
  state: number;
  watchRows?: FileTestRow[];
}) {
  return (await loadResource(opts))?.renderer;
}

afterEach(() => {
  logErrorMock.mockReset();
  toastErrorMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// First load transforms the SDK and file-viewer graph on cold CI runners.
describe("file plugin", { timeout: 10_000 }, () => {
  it("indexes supported text files through scoped file access", async () => {
    const resource = await loadResource({ mediaType: "text/plain", state: 3 });
    const bytes = new TextEncoder().encode("searchable notes").buffer;
    const input = {
      storage: { content: { kind: "file", storageId: "file-content" } },
    } as never;
    await expect(
      resource?.extractText?.(input, {
        readFile: () => Promise.resolve({ bytes, mediaType: "text/plain" }),
      })
    ).resolves.toBe("searchable notes");
    await expect(
      resource?.extractText?.(input, {
        readFile: () => Promise.resolve({ bytes, mediaType: "image/png" }),
      })
    ).resolves.toBeNull();
  });

  it("registers file upload resource", async () => {
    const definition = await loadResource({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      state: 3,
    });

    expect(definition?.createInWorkspace).toBeTypeOf("function");
    expect(definition?.storage.content?.kind).toBe("file");
    expect(
      definition?.commands.some((command) => command.id === "download-file")
    ).toBe(true);
  });

  it("creates and uploads every selected file", async () => {
    const definition = await loadResource({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      state: 3,
    });
    const files = [
      new File(["first"], "first.txt", { type: "text/plain" }),
      new File(["second"], "second.txt", { type: "text/plain" }),
    ];
    const input = {
      accept: "",
      files,
      multiple: false,
      onchange: null as (() => void) | null,
      oncancel: null as (() => void) | null,
      type: "",
      click() {
        this.onchange?.();
      },
    };
    vi.spyOn(document, "createElement").mockReturnValue(input as never);
    const createResource = vi
      .fn()
      .mockResolvedValueOnce({
        name: "first.txt",
        resourceId: "item_1",
        storage: { content: { kind: "file", storageId: "file:item_1" } },
      })
      .mockResolvedValueOnce({
        name: "second.txt",
        resourceId: "item_2",
        storage: { content: { kind: "file", storageId: "file:item_2" } },
      });
    const upload = vi.fn().mockResolvedValue({});

    const result = await definition?.createInWorkspace?.({
      createResource,
      deleteResource: vi.fn(),
      parentId: "root",
      uploadFile: upload,
    });

    expect(input.accept).toContain("application/pdf");
    expect(input.multiple).toBe(true);
    expect(createResource).toHaveBeenNthCalledWith(1, { name: "first.txt" });
    expect(createResource).toHaveBeenNthCalledWith(2, { name: "second.txt" });
    expect(upload).toHaveBeenNthCalledWith(1, {
      file: files[0],
      storage: { kind: "file", storageId: "file:item_1" },
    });
    expect(upload).toHaveBeenNthCalledWith(2, {
      file: files[1],
      storage: { kind: "file", storageId: "file:item_2" },
    });
    expect(result).toEqual({
      name: "first.txt",
      resourceId: "item_1",
      storage: { content: { kind: "file", storageId: "file:item_1" } },
    });
  });

  it("shows pending state while a synced local pointer is repaired", async () => {
    const renderer = await loadRenderer({
      localUri: null,
      mediaType: "image/png",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    expect(
      await screen.findByText("fileExtension.file.downloadPending")
    ).toBeTruthy();
  });

  it("renders image metadata at panel level", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const renderer = await loadRenderer({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      state: 3,
    });

    const reportReady = vi.fn();
    render(renderer?.({ resourceId: "item_1", reportReady }));

    const image = await screen.findByRole("img", { name: "image.png" });
    const panel = screen.getByTestId("image-panel");
    const frame = screen.getByTestId("image-resize-frame");
    const metadata = screen.getByTestId("image-metadata");
    expect(frame.className).not.toContain("resize");
    expect(panel.contains(metadata)).toBe(true);
    expect(frame.contains(metadata)).toBe(false);
    expect(metadata.textContent).toContain("image.png");
    expect(metadata.textContent).toContain("image/png");
    await waitFor(() => expect(reportReady).toHaveBeenCalledOnce());
    expect(metadata.textContent).toContain("10 B");

    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 480,
    });
    fireEvent.load(image);

    await waitFor(() => expect(metadata.textContent).toContain("640 x 480"));
  });

  it("keeps the current preview when upload state changes", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:image");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const readFile = vi.fn(() => Promise.resolve(new ArrayBuffer(1)));
    const renderer = await loadRenderer({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      readFile,
      state: 0,
      watchRows: [
        {
          localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
          mediaType: "image/png",
          state: 0,
        },
        {
          localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
          mediaType: "image/png",
          state: 3,
        },
      ],
    });

    render(renderer?.({ resourceId: "item_1" }));

    expect(await screen.findByRole("img", { name: "image.png" })).toBeTruthy();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(1));
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("does not revoke the current preview before a replacement is ready", async () => {
    let releaseSecondWatch: () => void = () => undefined;
    const secondWatchReady = new Promise<void>((resolve) => {
      releaseSecondWatch = resolve;
    });
    let resolveSecondRead: (buffer: ArrayBuffer) => void = () => undefined;
    const secondRead = new Promise<ArrayBuffer>((resolve) => {
      resolveSecondRead = resolve;
    });
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const readFile = vi
      .fn()
      .mockResolvedValueOnce(new ArrayBuffer(1))
      .mockReturnValueOnce(secondRead);
    const renderer = await loadRenderer({
      afterWatchYield: (index) => (index === 0 ? secondWatchReady : undefined),
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      readFile,
      state: 3,
      watchRows: [
        {
          localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
          mediaType: "image/png",
          state: 3,
        },
        {
          localUri:
            "indexeddb://lunaris-files-workspace_1/files/att_1-recovered.png",
          mediaType: "image/png",
          state: 3,
        },
      ],
    });

    render(renderer?.({ resourceId: "item_1" }));

    const image = await screen.findByRole("img", { name: "image.png" });
    await waitFor(() => expect(image.getAttribute("src")).toBe("blob:first"));

    releaseSecondWatch();
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
    expect(image.getAttribute("src")).toBe("blob:first");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    resolveSecondRead(new ArrayBuffer(1));

    await waitFor(() => expect(image.getAttribute("src")).toBe("blob:second"));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
  });

  it("resizes images by dragging the border while preserving ratio", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const renderer = await loadRenderer({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    const image = await screen.findByRole("img", { name: "image.png" });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 480,
    });
    fireEvent.load(image);

    const frame = screen.getByTestId("image-resize-frame");
    await waitFor(() => expect(frame.style.width).toBe("640px"));
    expect(frame.style.height).toBe("480px");

    fireEvent.pointerDown(screen.getByLabelText("Resize image se"), {
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, {
      clientX: 320,
      clientY: 240,
    });
    fireEvent.pointerUp(window);

    expect(frame.style.width).toBe("960px");
    expect(frame.style.height).toBe("720px");
  });

  it("renders PDFs with the PDF renderer", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const renderer = await loadRenderer({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.pdf",
      mediaType: "application/pdf",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    const viewer = await screen.findByTestId("extend-pdf-viewer");
    expect(viewer.getAttribute("data-file-name")).toBe("doc.pdf");
    expect(viewer.getAttribute("data-show-upload")).toBe("false");
    expect(viewer.getAttribute("data-src")).toBe("about:blank");
    expect(screen.queryByTestId("image-resize-frame")).toBeNull();
  });

  it("renders txt, md, and xml files from object URL text", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:text");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ text: () => Promise.resolve("hello\nworld") })
      )
    );

    const textRenderer = await loadRenderer({
      fileExtension: "txt",
      filename: "notes.txt",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.txt",
      mediaType: "text/plain",
      state: 3,
    });
    const { unmount } = render(textRenderer?.({ resourceId: "item_1" }));
    expect((await screen.findByLabelText("notes.txt")).textContent).toContain(
      "hello\nworld"
    );
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          text: () =>
            Promise.resolve("# Readme\n\n- first item\n\n**bold text**"),
        })
      )
    );
    const markdownRenderer = await loadRenderer({
      fileExtension: "md",
      filename: "readme.md",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.md",
      mediaType: "",
      state: 3,
    });
    const markdownView = render(markdownRenderer?.({ resourceId: "item_1" }));
    expect(
      await screen.findByTestId("markdown-renderer", {}, { timeout: 5000 })
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Readme" })
    ).toBeTruthy();
    expect(await screen.findByText("first item")).toBeTruthy();
    markdownView.unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ text: () => Promise.resolve("hello\nworld") })
      )
    );
    const xmlRenderer = await loadRenderer({
      fileExtension: "xml",
      filename: "feed.xml",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.xml",
      mediaType: "application/xml",
      state: 3,
    });
    render(xmlRenderer?.({ resourceId: "item_1" }));
    expect((await screen.findByTestId("xml-view")).textContent).toContain(
      "hello\nworld"
    );
  });

  it("renders json files with the JSON viewer and falls back for invalid JSON", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:json");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ text: () => Promise.resolve('{"title":"Lunaris"}') })
      )
    );
    const renderer = await loadRenderer({
      fileExtension: "json",
      filename: "data.json",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.json",
      mediaType: "application/octet-stream",
      state: 3,
    });

    const { unmount } = render(renderer?.({ resourceId: "item_1" }));

    expect((await screen.findByTestId("json-view")).textContent).toContain(
      '{"title":"Lunaris"}'
    );
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ text: () => Promise.resolve("{nope") }))
    );
    const invalidRenderer = await loadRenderer({
      fileExtension: "json",
      filename: "broken.json",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.json",
      mediaType: "application/json",
      state: 3,
    });
    render(invalidRenderer?.({ resourceId: "item_1" }));
    expect((await screen.findByLabelText("broken.json")).textContent).toContain(
      "{nope"
    );
  });

  it("renders CSV files with the Extend viewer", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          text: () =>
            Promise.resolve('name,notes\nLuna,"quoted, field"\nSolo\n,last'),
        })
      )
    );
    const renderer = await loadRenderer({
      fileExtension: "csv",
      filename: "rows.csv",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.csv",
      mediaType: "text/csv",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    const viewer = await screen.findByTestId("extend-csv-viewer");
    expect(viewer.getAttribute("data-content")).toBe(
      'name,notes\nLuna,"quoted, field"\nSolo\n,last'
    );
    expect(viewer.getAttribute("data-file-name")).toBe("rows.csv");
    expect(viewer.getAttribute("data-search")).toBe("true");
    expect(viewer.getAttribute("data-show-upload")).toBe("false");
    expect(screen.getByRole("region", { name: "rows.csv" })).toBeTruthy();
  });

  it("forwards uneven CSV rows to the Extend viewer", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ text: () => Promise.resolve("a,b,c\n1") }))
    );
    const renderer = await loadRenderer({
      fileExtension: "csv",
      filename: "uneven.csv",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.csv",
      mediaType: "text/csv",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    expect(
      (await screen.findByTestId("extend-csv-viewer")).getAttribute(
        "data-content"
      )
    ).toBe("a,b,c\n1");
  });

  it("forwards empty CSV files to the Extend viewer", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ text: () => Promise.resolve(" \n") }))
    );
    const renderer = await loadRenderer({
      fileExtension: "csv",
      filename: "empty.csv",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.csv",
      mediaType: "text/csv",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    expect(
      (await screen.findByTestId("extend-csv-viewer")).getAttribute(
        "data-content"
      )
    ).toBe(" \n");
    expect(screen.getByRole("region", { name: "empty.csv" })).toBeTruthy();
  });

  it("forwards large CSV files to the Extend viewer", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          text: () =>
            Promise.resolve(
              Array.from(
                { length: 500 },
                (_, index) => `${index},value-${index}`
              ).join("\n")
            ),
        })
      )
    );
    const renderer = await loadRenderer({
      fileExtension: "csv",
      filename: "large.csv",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.csv",
      mediaType: "text/csv",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    expect(
      (await screen.findByTestId("extend-csv-viewer", {}, { timeout: 5000 }))
        .getAttribute("data-content")
        ?.endsWith("499,value-499")
    ).toBe(true);
  });

  it("renders DOCX files with the Extend viewer", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:docx");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const renderer = await loadRenderer({
      fileExtension: "docx",
      filename: "brief.docx",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.docx",
      mediaType: "application/octet-stream",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    const viewer = await screen.findByTestId("extend-docx-viewer");
    expect(viewer.getAttribute("data-file-name")).toBe("brief.docx");
    expect(viewer.getAttribute("data-is-dark")).toBe("false");
    expect(viewer.getAttribute("data-show-file-actions-menu")).toBe("false");
    expect(viewer.getAttribute("data-show-upload")).toBe("false");
    expect(viewer.getAttribute("data-src")).toBe("blob:docx");
  });

  it("leaves legacy DOC files unsupported", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:doc");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const renderer = await loadRenderer({
      fileExtension: "doc",
      filename: "brief.doc",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.doc",
      mediaType: "application/msword",
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    expect(await screen.findByText("Unsupported file")).toBeTruthy();
    expect(screen.queryByTestId("extend-docx-viewer")).toBeNull();
  });

  it("renders PPTX and XLSX files with Extend viewers", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:office");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const pptxRenderer = await loadRenderer({
      fileExtension: "pptx",
      filename: "deck.pptx",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.pptx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      state: 3,
    });
    const { unmount } = render(pptxRenderer?.({ resourceId: "item_1" }));
    const pptxViewer = await screen.findByTestId("extend-pptx-viewer");
    expect(pptxViewer.getAttribute("data-file-name")).toBe("deck.pptx");
    expect(pptxViewer.getAttribute("data-show-upload")).toBe("false");
    expect(pptxViewer.getAttribute("data-src")).toBe("blob:office");
    unmount();

    const xlsxRenderer = await loadRenderer({
      fileExtension: "xlsx",
      filename: "sheet.xlsx",
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.xlsx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      state: 3,
    });
    render(xlsxRenderer?.({ resourceId: "item_1" }));
    const xlsxViewer = await screen.findByTestId("extend-xlsx-viewer");
    expect(xlsxViewer.getAttribute("data-file-name")).toBe("sheet.xlsx");
    expect(xlsxViewer.getAttribute("data-show-upload")).toBe("false");
    expect(xlsxViewer.getAttribute("data-src")).toBe("blob:office");
  });

  it("downloads local bytes with original filename", async () => {
    const resource = await loadResource({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      state: 3,
    });
    const link = {
      download: "",
      href: "",
      rel: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValue(link as never);
    vi.spyOn(document.body, "append").mockImplementation(() => undefined);

    resource?.commands[0]?.onExecute({
      resourceId: "item_1",
      storage: { content: { kind: "file", storageId: "file:item_1" } },
      downloadFile: async () => {
        const url = URL.createObjectURL(
          new Blob([new ArrayBuffer(1)], {
            type: "image/png",
          })
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "image.png";
        link.rel = "noopener";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return true;
      },
      openRightDockPanel: vi.fn(),
    });

    await waitFor(() => expect(link.click).toHaveBeenCalled());
    expect(link.download).toBe("image.png");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("logs and toasts when download bytes are missing", async () => {
    const resource = await loadResource({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      readReject: true,
      state: 3,
    });

    resource?.commands[0]?.onExecute({
      resourceId: "item_1",
      storage: { content: { kind: "file", storageId: "file:item_1" } },
      downloadFile: async () => {
        throw new Error("missing bytes");
      },
      openRightDockPanel: vi.fn(),
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("File download unavailable")
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "failed to download file",
        tag: "FilePlugin",
      })
    );
  });

  it("toasts when download metadata has no local pointer", async () => {
    const resource = await loadResource({
      localUri: null,
      mediaType: "image/png",
      state: 3,
    });

    resource?.commands[0]?.onExecute({
      resourceId: "item_1",
      storage: { content: { kind: "file", storageId: "file:item_1" } },
      downloadFile: async () => false,
      openRightDockPanel: vi.fn(),
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("File download unavailable")
    );
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("logs preview read failures without showing a toast", async () => {
    const renderer = await loadRenderer({
      localUri: "indexeddb://lunaris-files-workspace_1/files/att_1.png",
      mediaType: "image/png",
      readReject: true,
      state: 3,
    });

    render(renderer?.({ resourceId: "item_1" }));

    await waitFor(() =>
      expect(logErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentId: "att_1",
          resourceId: "item_1",
          msg: "failed to load local attachment preview",
          workspaceId: "workspace_1",
          tag: "AttachmentStorage",
        })
      )
    );
    expect(
      await screen.findByText("fileExtension.file.downloadFailed")
    ).toBeTruthy();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
