import type {
  PluginYjsPersistenceState,
  PluginYjsProvider,
  ResourceCommandContext,
  ResourceCommandContribution,
  ResourceTypeDefinition,
  ResourceStorageHandle,
  SearchIndexerContribution,
  ResourceViewProps,
  ViewDefinition,
} from "@lunarisapp/plugin-sdk";
import Claude from "@thesvg/react/claude";
import OpenaiChatgpt from "@thesvg/react/openai-chatgpt";
import {
  ViewReady,
  createPreloadableLazy,
  definePlugin,
  useYjsStorage,
  useYjsAwareness,
  useOrganizationAccess,
} from "@lunarisapp/plugin-sdk";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import {
  Copy01Icon,
  File01Icon,
  FileExportIcon,
  Share04Icon,
  Time01Icon,
} from "@lunarisapp/ui/icons";
import { log, parseError } from "evlog";
import { useTheme } from "next-themes";
import posthog from "posthog-js";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { getI18n } from "react-i18next";
import { toast } from "sonner";
import type { Doc } from "yjs";
import * as z from "zod";
import { RICH_TEXT_PLUGIN_ID } from "./constants";
import type { ChatProvider } from "./markdown-actions";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import manifest from "./manifest.json";
import { RichTextSkeleton } from "./rich-text-skeleton";
import { useRichTextStats } from "./use-rich-text-stats";
const versionHistoryModule = createPreloadableLazy(() =>
  import("./version-history-panel").then((module) => ({
    default: module.RichTextVersionHistoryPanel,
  }))
);
const RichTextVersionHistoryPanel = versionHistoryModule.Component;

const richTextEditorModule = createPreloadableLazy(() =>
  import("./rich-text-editor-inner").then((m) => ({
    default: m.RichTextEditorInner,
  }))
);
const RichTextEditorInner = richTextEditorModule.Component;

/**
 * Load Yjs document from database, create headless BlockNote editor,
 * and extract full Block[] with all formatting for compilation.
 */
export { RICH_TEXT_PLUGIN_ID } from "./constants";
export { RichTextVersionHistoryPanel };

const RICH_TEXT_VERSION_HISTORY_TOGGLE_EVENT =
  "lunaris:rich-text:toggle-version-history";

interface VersionHistoryToggleDetail {
  resourceId: string;
}

function toggleVersionHistorySidebar({
  resourceId,
}: VersionHistoryToggleDetail): void {
  window.dispatchEvent(
    new CustomEvent<VersionHistoryToggleDetail>(
      RICH_TEXT_VERSION_HISTORY_TOGGLE_EVENT,
      { detail: { resourceId } }
    )
  );
}

function translateAction(key: string, fallback: string): string {
  return getI18n().t(key, { defaultValue: fallback });
}

function exportDocument(
  context: ResourceCommandContext,
  format: "markdown" | "pdf" | "docx"
): void {
  const resourceReadContext = context.resourceReadContext;
  const resourceId = context.resourceId;
  const content = context.storage.content;
  if (content?.kind !== "yjs") {
    return;
  }
  const documentName = context.resourceName.trim() || "Untitled";
  const toastId =
    format === "markdown"
      ? undefined
      : toast.loading(
          translateAction(
            format === "docx"
              ? "extensions.catalog.lunaris.rich-text.exportDocxGenerating"
              : "extensions.catalog.lunaris.rich-text.exportPdfGenerating",
            format === "docx" ? "Generating DOCX…" : "Generating PDF…"
          )
        );
  const exportPromise = (async () => {
    await context.waitForYjsPersistence(content);
    const module = await import("./export");
    if (format === "docx") {
      return module.exportResourceAsDocx(
        resourceReadContext,
        resourceId,
        documentName
      );
    }
    return format === "pdf"
      ? module.exportDocumentAsPdf(
          resourceReadContext,
          resourceId,
          documentName
        )
      : module.exportDocumentAsMarkdown(
          resourceReadContext,
          resourceId,
          documentName
        );
  })();

  void exportPromise
    .then((result) => {
      posthog.capture("rich_text_exported", { format, success: true });
      if (format === "docx" && result && result.missingImages > 0) {
        toast.warning(
          translateAction(
            "extensions.catalog.lunaris.rich-text.exportDocxMissingImages",
            "DOCX downloaded; some images were unavailable"
          ),
          { id: toastId }
        );
      } else if (toastId !== undefined) {
        toast.success(
          translateAction(
            format === "docx"
              ? "extensions.catalog.lunaris.rich-text.exportDocxSuccess"
              : "extensions.catalog.lunaris.rich-text.exportPdfSuccess",
            format === "docx" ? "DOCX downloaded" : "PDF downloaded"
          ),
          { id: toastId }
        );
      }
    })
    .catch((error) => {
      posthog.capture("rich_text_exported", { format, success: false });
      log.error({
        tag: "RichText",
        msg: "Failed to export document",
        resourceId,
        format,
        error: parseError(error),
      });
      const message = translateAction(
        "extensions.catalog.lunaris.rich-text.exportFailed",
        "Unable to export document"
      );
      if (toastId === undefined) {
        toast.error(message);
      } else {
        toast.error(message, { id: toastId });
      }
    });
}

function copyPage(context: ResourceCommandContext): void {
  const resourceReadContext = context.resourceReadContext;
  const resourceId = context.resourceId;
  const content = context.storage.content;
  if (content?.kind !== "yjs") {
    return;
  }
  const copyPromise = (async () => {
    await context.waitForYjsPersistence(content);
    const module = await import("./markdown-actions");
    return module.copyPageAsMarkdown(resourceReadContext, resourceId);
  })();

  void copyPromise
    .then(() => {
      posthog.capture("rich_text_page_copied", { success: true });
      toast.success(
        translateAction(
          "extensions.catalog.lunaris.rich-text.copyPageSuccess",
          "Page copied as Markdown"
        )
      );
    })
    .catch((error) => {
      posthog.capture("rich_text_page_copied", { success: false });
      log.error({
        tag: "RichText",
        msg: "Failed to copy page",
        resourceId,
        error: parseError(error),
      });
      toast.error(
        translateAction(
          "extensions.catalog.lunaris.rich-text.copyPageFailed",
          "Unable to copy page"
        )
      );
    });
}

function openPageInChat(
  context: ResourceCommandContext,
  provider: ChatProvider
): void {
  const resourceReadContext = context.resourceReadContext;
  const resourceId = context.resourceId;
  const content = context.storage.content;
  if (content?.kind !== "yjs") {
    return;
  }
  const targetWindow = window.open("about:blank", "_blank");
  if (targetWindow) {
    targetWindow.opener = null;
  }

  const openPromise = (async () => {
    await context.waitForYjsPersistence(content);
    const module = await import("./markdown-actions");
    return module.openPageInChat(
      resourceReadContext,
      resourceId,
      provider,
      targetWindow
    );
  })();

  void openPromise
    .then(({ copiedToClipboard, prefilled }) => {
      posthog.capture("rich_text_opened_in_chat", {
        copiedToClipboard,
        prefilled,
        provider,
        success: true,
      });
      if (copiedToClipboard) {
        toast.success(
          translateAction(
            "extensions.catalog.lunaris.rich-text.openInLongPageCopied",
            "Page copied. Paste it into the new chat"
          )
        );
      }
    })
    .catch((error) => {
      targetWindow?.close();
      posthog.capture("rich_text_opened_in_chat", {
        provider,
        success: false,
      });
      log.error({
        tag: "RichText",
        msg: "Failed to open page in chat",
        resourceId,
        provider,
        error: parseError(error),
      });
      toast.error(
        translateAction(
          "extensions.catalog.lunaris.rich-text.openInFailed",
          "Unable to open page in chat"
        )
      );
    });
}

export interface RichTextEditorProps {
  isVisible?: boolean;
  reportReady?: () => void;
  resourceId?: string;
  storage: ResourceStorageHandle;
}

function useYjsPersistenceState(
  provider: PluginYjsProvider | null
): PluginYjsPersistenceState {
  const subscribe = useCallback(
    (listener: () => void) =>
      provider?.subscribePersistenceState(listener) ??
      (() => {
        /* No action while this capability is unavailable. */
      }),
    [provider]
  );
  const getSnapshot = useCallback(
    () => provider?.getPersistenceState() ?? "idle",
    [provider]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function RichTextEditor({
  isVisible = true,
  storage,
  resourceId,
  reportReady,
}: RichTextEditorProps) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const { yDoc, yProvider, isLoading, error } = useYjsStorage(storage);
  const presence = useYjsAwareness(storage, { enabled: isVisible });
  const storageId = storage.storageId;
  const persistenceState = useYjsPersistenceState(yProvider);
  const { canWriteContent } = useOrganizationAccess();
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

  useEffect(() => {
    setIsVersionHistoryOpen(false);

    const handleToggle = (event: Event) => {
      const { detail } = event as CustomEvent<VersionHistoryToggleDetail>;
      if (detail.resourceId !== resourceId) {
        return;
      }

      setIsVersionHistoryOpen((isOpen) => !isOpen);
    };

    window.addEventListener(
      RICH_TEXT_VERSION_HISTORY_TOGGLE_EVENT,
      handleToggle
    );
    return () => {
      window.removeEventListener(
        RICH_TEXT_VERSION_HISTORY_TOGGLE_EVENT,
        handleToggle
      );
    };
  }, [storageId, resourceId]);

  if (error) {
    return (
      <PanelError
        description={error.message}
        title="Error loading document"
        variant="error"
      />
    );
  }

  if (isLoading && !yDoc) {
    return <RichTextSkeleton />;
  }
  if (!yDoc) {
    return (
      <PanelError
        description="The document you're looking for doesn't exist or has been deleted."
        title="Document not found"
        variant="not-found"
      />
    );
  }

  return (
    <div
      className="@container relative flex h-full min-h-0 overflow-hidden"
      data-yjs-persistence-state={persistenceState}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<RichTextSkeleton />}>
            <ViewReady reportReady={reportReady}>
              <RichTextEditorInner
                awareness={presence.awareness}
                editable={canWriteContent}
                resourceId={resourceId ?? ""}
                theme={theme}
                yDoc={yDoc}
              />
            </ViewReady>
          </Suspense>
        </div>
      </div>
      {isVersionHistoryOpen ? (
        <Suspense fallback={null}>
          <RichTextVersionHistoryPanel
            resourceId={resourceId}
            onClose={() => setIsVersionHistoryOpen(false)}
            storage={storage}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function RichTextStatsCount({ yDoc }: { yDoc: Doc }) {
  const counts = useRichTextStats(yDoc);

  if (!counts) {
    return null;
  }

  return (
    <>
      <span>
        {counts.words} {counts.words === 1 ? "word" : "words"}
      </span>
      <span>
        {counts.chars} {counts.chars === 1 ? "char" : "chars"}
      </span>
    </>
  );
}

function RichTextStatusBarInner({
  storage,
}: {
  storage: ResourceStorageHandle;
}) {
  const { yDoc, isLoading } = useYjsStorage(storage);

  if (isLoading && !yDoc) {
    return null;
  }
  if (!yDoc) {
    return null;
  }

  return <RichTextStatsCount yDoc={yDoc} />;
}

export function RichTextStatusBar({
  storage,
}: {
  storage?: ResourceStorageHandle;
}) {
  if (!storage) {
    return null;
  }

  return <RichTextStatusBarInner storage={storage} />;
}

const richTextCommands: ResourceCommandContribution = {
  commands: [
    {
      children: [
        {
          id: "open-in-chatgpt",
          iconElement: (
            <OpenaiChatgpt aria-hidden="true" className="size-4 shrink-0" />
          ),
          labelKey: "extensions.catalog.lunaris.rich-text.chatGPT",
          onExecute: (context) => openPageInChat(context, "chatgpt"),
        },
        {
          id: "open-in-claude",
          iconElement: (
            <Claude aria-hidden="true" className="size-4 shrink-0" />
          ),
          labelKey: "extensions.catalog.lunaris.rich-text.claude",
          onExecute: (context) => openPageInChat(context, "claude"),
        },
      ],
      icon: Share04Icon,
      id: "open-in",
      labelKey: "extensions.catalog.lunaris.rich-text.openIn",
    },
    {
      icon: Copy01Icon,
      id: "copy-page",
      labelKey: "extensions.catalog.lunaris.rich-text.copyPage",
      onExecute: copyPage,
    },
    {
      children: [
        {
          id: "export-pdf",
          labelKey: "extensions.catalog.lunaris.rich-text.exportPdf",
          onExecute: (context) => exportDocument(context, "pdf"),
        },
        {
          id: "export-docx",
          labelKey: "extensions.catalog.lunaris.rich-text.exportDocx",
          onExecute: (context) => exportDocument(context, "docx"),
        },
        {
          id: "export-markdown",
          labelKey: "extensions.catalog.lunaris.rich-text.exportMarkdown",
          onExecute: (context) => exportDocument(context, "markdown"),
        },
      ],
      icon: FileExportIcon,
      id: "export-as",
      labelKey: "extensions.catalog.lunaris.rich-text.exportAs",
    },
    {
      icon: Time01Icon,
      id: "version-history",
      labelKey: "common.versionHistory",
      onExecute: ({ resourceId }) => {
        toggleVersionHistorySidebar({ resourceId });
      },
    },
  ],
  id: "lunaris.rich-text.commands",
  resourceTypeIds: [RICH_TEXT_PLUGIN_ID],
};

const richTextResourceType: ResourceTypeDefinition = {
  defaultViewId: RICH_TEXT_PLUGIN_ID,
  name: "Rich Text",
  resourceTypeId: RICH_TEXT_PLUGIN_ID,
  icon: File01Icon,
  schema: {
    currentVersion: 1,
    id: "lunaris.rich-text.blocknote",
    read: ({ storage }) =>
      storage.content?.kind === "yjs"
        ? { "": storage.content.document.getXmlFragment().toJSON() }
        : {},
    versions: { 1: z.record(z.string(), z.unknown()) },
  },
  storage: { content: { kind: "yjs" } },
};

const richTextView: ViewDefinition = {
  icon: File01Icon,
  name: "Rich Text",
  preload: richTextEditorModule.preload,
  renderer: ({
    reportReady,
    resource,
    storage,
    isVisible,
  }: ResourceViewProps) => {
    const { resourceId } = resource;
    return (
      <RichTextEditor
        isVisible={isVisible}
        resourceId={resourceId}
        reportReady={reportReady}
        storage={storage.content!}
      />
    );
  },
  statusBar: ({ storage }) => <RichTextStatusBar storage={storage.content!} />,
  storageRequirements: { content: "yjs" },
  target: { kind: "resource", resourceTypeIds: [RICH_TEXT_PLUGIN_ID] },
  viewId: RICH_TEXT_PLUGIN_ID,
};

function extractRichTextPayload(payload: unknown): string {
  const values: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const text = value
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        values.push(text);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        key === "" ||
        key === "text" ||
        key === "content" ||
        key === "default"
      ) {
        visit(child);
      }
    }
  };
  visit(payload);
  return values.join("\n");
}

const richTextSearchIndexer: SearchIndexerContribution = {
  extractText: ({ payload }) => extractRichTextPayload(payload) || null,
  id: "lunaris.rich-text.search-indexer",
  resourceTypeIds: [RICH_TEXT_PLUGIN_ID],
};

/** Rich Text extension - uses the SDK's init-based registration API. */
export const richTextPlugin = definePlugin({
  manifest,
  async activate({ contributions, slots }) {
    const { richTextExporterRepresentation, richTextExporterRepresentations } =
      await import("./exporter-integration");
    contributions.resourceType(richTextResourceType);
    contributions.view(richTextView);
    contributions.command(richTextCommands);
    slots.contribute(
      richTextExporterRepresentations,
      richTextExporterRepresentation
    );
    contributions.searchIndexer(richTextSearchIndexer);
    contributions.locales({ en, es, fr, de, "pt-BR": ptBR });
  },
});

export default richTextPlugin;
