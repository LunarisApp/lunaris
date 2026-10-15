import {
  ViewReady,
  createPreloadableLazy,
  type PluginStoredFileMetadata,
} from "@lunarisapp/plugin-sdk";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { log, parseError } from "evlog";
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageRenderer } from "./image-renderer";
import { PlainTextRenderer } from "./text-renderer-utils";
import { UnsupportedRenderer } from "./unsupported-renderer";

type TextRendererKind = "csv" | "json" | "markdown" | "text" | "xml";
type OfficeRendererKind = "docx" | "pptx" | "xlsx";
type FilePreviewKind =
  | { type: "image" }
  | { type: "office"; kind: OfficeRendererKind }
  | { type: "pdf" }
  | { type: "text"; kind: TextRendererKind }
  | { type: "unsupported" };

interface PreviewProps {
  metadata: PluginStoredFileMetadata;
  objectUrl: string;
  reportReady?: () => void;
}

interface TextRendererProps extends PreviewProps {
  kind: TextRendererKind;
}

const csvRendererModule = createPreloadableLazy(() =>
  import("./csv-renderer").then((m) => ({ default: m.CsvRenderer }))
);
const CsvRenderer = csvRendererModule.Component;
const docxRendererModule = createPreloadableLazy(() =>
  import("./docx-renderer").then((m) => ({ default: m.DocxRenderer }))
);
const DocxRenderer = docxRendererModule.Component;
const jsonRendererModule = createPreloadableLazy(() =>
  import("./json-renderer").then((m) => ({ default: m.JsonRenderer }))
);
const JsonRenderer = jsonRendererModule.Component;
const markdownRendererModule = createPreloadableLazy(() =>
  import("./markdown-renderer").then((m) => ({ default: m.MarkdownRenderer }))
);
const MarkdownRenderer = markdownRendererModule.Component;
const pdfRendererModule = createPreloadableLazy(() =>
  import("./pdf-renderer").then((m) => ({ default: m.PdfRenderer }))
);
const PdfRenderer = pdfRendererModule.Component;
const pptxRendererModule = createPreloadableLazy(() =>
  import("./pptx-renderer").then((m) => ({ default: m.PptxRenderer }))
);
const PptxRenderer = pptxRendererModule.Component;
const xmlRendererModule = createPreloadableLazy(() =>
  import("./xml-renderer").then((m) => ({ default: m.XmlRenderer }))
);
const XmlRenderer = xmlRendererModule.Component;
const xlsxRendererModule = createPreloadableLazy(() =>
  import("./xlsx-renderer").then((m) => ({ default: m.XlsxRenderer }))
);
const XlsxRenderer = xlsxRendererModule.Component;

export function preloadFileRenderer(metadata: PluginStoredFileMetadata) {
  const preview = resolveFilePreview(metadata);
  if (preview.type === "pdf") return pdfRendererModule.preload();
  if (preview.type === "office") {
    if (preview.kind === "docx") return docxRendererModule.preload();
    if (preview.kind === "pptx") return pptxRendererModule.preload();
    return xlsxRendererModule.preload();
  }
  if (preview.type !== "text") return Promise.resolve();
  if (preview.kind === "csv") return csvRendererModule.preload();
  if (preview.kind === "json") return jsonRendererModule.preload();
  if (preview.kind === "markdown") return markdownRendererModule.preload();
  if (preview.kind === "xml") return xmlRendererModule.preload();
  return Promise.resolve();
}

export function renderFilePreview({ metadata, objectUrl, reportReady }: PreviewProps) {
  const preview = resolveFilePreview(metadata);
  if (preview.type === "image") {
    return (
      <ViewReady reportReady={reportReady}>
        <ImageRenderer metadata={metadata} objectUrl={objectUrl} />
      </ViewReady>
    );
  }

  if (preview.type === "pdf") {
    return (
      <Suspense fallback={null}>
        <ViewReady reportReady={reportReady}>
          <PdfRenderer filename={metadata.filename} objectUrl={objectUrl} />
        </ViewReady>
      </Suspense>
    );
  }

  if (preview.type === "office") {
    return (
      <Suspense fallback={null}>
        <ViewReady reportReady={reportReady}>
          {preview.kind === "docx" ? (
            <DocxRenderer filename={metadata.filename} objectUrl={objectUrl} />
          ) : null}
          {preview.kind === "pptx" ? (
            <PptxRenderer filename={metadata.filename} objectUrl={objectUrl} />
          ) : null}
          {preview.kind === "xlsx" ? (
            <XlsxRenderer filename={metadata.filename} objectUrl={objectUrl} />
          ) : null}
        </ViewReady>
      </Suspense>
    );
  }

  if (preview.type === "text") {
    return (
      <TextFileRenderer
        kind={preview.kind}
        metadata={metadata}
        objectUrl={objectUrl}
        reportReady={reportReady}
      />
    );
  }

  return (
    <ViewReady reportReady={reportReady}>
      <UnsupportedRenderer mediaType={metadata.mediaType} />
    </ViewReady>
  );
}

function resolveFilePreview(metadata: PluginStoredFileMetadata): FilePreviewKind {
  if (metadata.mediaType.startsWith("image/")) return { type: "image" };
  if (
    metadata.mediaType === "application/pdf" ||
    getFileExtension(metadata) === "pdf"
  ) {
    return { type: "pdf" };
  }
  const officeKind = getOfficeRendererKind(metadata);
  if (officeKind) return { kind: officeKind, type: "office" };
  const textKind = getTextRendererKind(metadata);
  if (textKind) return { kind: textKind, type: "text" };
  return { type: "unsupported" };
}

function getFileExtension(metadata: PluginStoredFileMetadata) {
  return (
    metadata.fileExtension ||
    metadata.filename.split(".").pop()?.toLowerCase() ||
    ""
  ).toLowerCase();
}

function getTextRendererKind(
  metadata: PluginStoredFileMetadata
): TextRendererKind | null {
  const extension = getFileExtension(metadata);
  if (extension === "csv") return "csv";
  if (extension === "json") return "json";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "txt") return "text";
  if (extension === "xml") return "xml";

  switch (metadata.mediaType) {
    case "application/json":
      return "json";
    case "application/xml":
    case "text/xml":
      return "xml";
    case "text/csv":
      return "csv";
    case "text/markdown":
      return "markdown";
    case "text/plain":
      return "text";
    default:
      return null;
  }
}

function getOfficeRendererKind(
  metadata: PluginStoredFileMetadata
): OfficeRendererKind | null {
  const extension = getFileExtension(metadata);
  if (extension === "docx") return "docx";
  if (extension === "ppt" || extension === "pptx") return "pptx";
  if (extension === "xls" || extension === "xlsx") return "xlsx";

  switch (metadata.mediaType) {
    case "application/vnd.ms-excel":
      return "xlsx";
    case "application/vnd.ms-powerpoint":
      return "pptx";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "pptx";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    default:
      return null;
  }
}

function useObjectUrlText(objectUrl: string) {
  const [state, setState] = useState<
    | { status: "error"; text: null }
    | { status: "loading"; text: null }
    | { status: "success"; text: string }
  >({ status: "loading", text: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", text: null });

    fetch(objectUrl)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) setState({ status: "success", text });
      })
      .catch((error) => {
        log.error({
          tag: "FilePlugin",
          msg: "failed to read text file preview",
          error: parseError(error),
        });
        if (!cancelled) setState({ status: "error", text: null });
      });

    return () => {
      cancelled = true;
    };
  }, [objectUrl]);

  return state;
}

function TextFileRenderer({ kind, metadata, objectUrl, reportReady }: TextRendererProps) {
  const { t } = useTranslation();
  const state = useObjectUrlText(objectUrl);

  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <ViewReady reportReady={reportReady}>
        <div className="flex h-full items-center justify-center p-6">
          <PanelError
            description={metadata.filename}
            title={t("fileExtension.file.downloadFailed")}
            variant="error"
          />
        </div>
      </ViewReady>
    );
  }

  const props = { filename: metadata.filename, text: state.text };
  if (kind === "text")
    return (
      <ViewReady reportReady={reportReady}>
        <PlainTextRenderer {...props} />
      </ViewReady>
    );

  return (
    <Suspense fallback={null}>
      <ViewReady reportReady={reportReady}>
        {kind === "csv" ? <CsvRenderer {...props} /> : null}
        {kind === "json" ? <JsonRenderer {...props} /> : null}
        {kind === "markdown" ? <MarkdownRenderer {...props} /> : null}
        {kind === "xml" ? <XmlRenderer text={state.text} /> : null}
      </ViewReady>
    </Suspense>
  );
}
