import type {
  ResourceCommandContribution,
  ResourceTypeDefinition,
  ResourceViewProps,
  SearchIndexerContribution,
  ViewDefinition,
} from "@lunarisapp/plugin-sdk";
import { definePlugin } from "@lunarisapp/plugin-sdk";
import { AttachmentIcon, Download01Icon } from "@lunarisapp/ui/icons";
import { log, parseError } from "evlog";
import { toast } from "sonner";
import * as z from "zod";
import { FileViewer } from "./file-viewer";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import manifest from "./manifest.json";

export const FILE_PLUGIN_ID = "lunaris.file";

const FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain,text/markdown,text/csv,application/json,application/xml,text/xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.txt,.md,.xml,.json,.csv,.docx,.pptx,.xlsx";

function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = FILE_ACCEPT;
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

const fileCommands: ResourceCommandContribution = {
  commands: [
    {
      icon: Download01Icon,
      id: "download-file",
      labelKey: "fileExtension.file.download",
      onExecute: (context) => {
        const content = context.storage.content;
        if (content?.kind !== "file") {
          return;
        }
        void context
          .downloadFile(content)
          .then((downloaded) => {
            if (downloaded) {
              return;
            }
            toast.error("File download unavailable");
          })
          .catch((error) => {
            log.error({
              tag: "FilePlugin",
              msg: "failed to download file",
              error: parseError(error),
              resourceId: context.resourceId,
            });
            toast.error("File download unavailable");
          });
      },
    },
  ],
  id: "lunaris.file.commands",
  resourceTypeIds: [FILE_PLUGIN_ID],
};

const fileResourceType: ResourceTypeDefinition = {
  createInWorkspace: async ({ createResource, deleteResource, uploadFile }) => {
    const files = await pickFiles();
    let firstResult: Awaited<ReturnType<typeof createResource>> | null = null;
    for (const file of files) {
      const resource = await createResource({ name: file.name });
      try {
        const content = resource.storage.content;
        if (content?.kind !== "file") {
          throw new Error("File resource storage was not provisioned");
        }
        await uploadFile({ file, storage: content });
      } catch (error) {
        await deleteResource(resource.resourceId);
        throw error;
      }
      firstResult ??= resource;
    }
    return firstResult;
  },
  defaultViewId: FILE_PLUGIN_ID,
  icon: AttachmentIcon,
  name: "File",
  resourceTypeId: FILE_PLUGIN_ID,
  schema: {
    currentVersion: 1,
    id: "lunaris.file.metadata",
    read: ({ storage }) =>
      storage.content?.kind === "file" ? (storage.content.metadata ?? {}) : {},
    versions: { 1: z.record(z.string(), z.unknown()) },
  },
  storage: { content: { kind: "file" } },
};

const fileView: ViewDefinition = {
  icon: AttachmentIcon,
  name: "File",
  renderer: ({ reportReady, storage }: ResourceViewProps) => (
    <FileViewer reportReady={reportReady} storage={storage.content!} />
  ),
  storageRequirements: { content: "file" },
  target: { kind: "resource", resourceTypeIds: [FILE_PLUGIN_ID] },
  viewId: FILE_PLUGIN_ID,
};

const SEARCHABLE_FILE_MEDIA_TYPES = new Set([
  "application/json",
  "application/xml",
  "text/markdown",
  "text/plain",
  "text/xml",
]);

const fileSearchIndexer: SearchIndexerContribution = {
  extractText: async ({ storage }, context) => {
    const content = storage.content;
    if (content?.kind !== "file") {
      return null;
    }
    const file = await context.readFile(content);
    if (!(file?.mediaType && SEARCHABLE_FILE_MEDIA_TYPES.has(file.mediaType))) {
      return null;
    }
    return new TextDecoder().decode(file.bytes).trim() || null;
  },
  id: "lunaris.file.search-indexer",
  resourceTypeIds: [FILE_PLUGIN_ID],
};

export const filePlugin = definePlugin({
  manifest,
  activate({ contributions }) {
    contributions.resourceType(fileResourceType);
    contributions.view(fileView);
    contributions.command(fileCommands);
    contributions.searchIndexer(fileSearchIndexer);
    contributions.locales({ de, en, es, fr, "pt-BR": ptBR });
  },
});

export default filePlugin;
