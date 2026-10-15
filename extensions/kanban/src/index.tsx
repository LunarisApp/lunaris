import type {
  ResourceTypeDefinition,
  ResourceViewProps,
  ViewDefinition,
} from "@lunarisapp/plugin-sdk";
import {
  createPreloadableLazy,
  definePlugin,
  useWorkspaceChildrenMap,
} from "@lunarisapp/plugin-sdk";
import { KanbanIcon, Task01Icon } from "@lunarisapp/ui/icons";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Map as YMap } from "yjs";
import * as z from "zod";
import {
  kanbanExporterRepresentation,
  kanbanExporterRepresentations,
} from "./exporter-integration";
import {
  DEFAULT_STATUS_PROPERTY,
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
} from "./constants";
import { KanbanSkeleton } from "./kanban-skeleton";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import manifest from "./manifest.json";
import {
  appendPropertyDefinition,
  markPropertiesInitialized,
} from "./property-state";

const kanbanEditorModule = createPreloadableLazy(async () => {
  const module = await import("./kanban-editor");
  await module.preloadKanbanEditor();
  return { default: module.KanbanEditor };
});
const KanbanEditor = kanbanEditorModule.Component;

const taskEditorModule = createPreloadableLazy(() =>
  import("./components/task-content").then((module) => ({
    default: module.TaskEditor,
  })),
);
const TaskEditor = taskEditorModule.Component;

function KanbanStatusBar({ resourceId }: { resourceId?: string }) {
  const { t } = useTranslation();
  const children = useWorkspaceChildrenMap();
  if (!resourceId) return null;
  const count = (children.get(resourceId) ?? []).filter(
    (item) => item.resourceTypeId === KANBAN_TASK_RESOURCE_TYPE_ID,
  ).length;
  return (
    <span>
      {t("extensions.catalog.lunaris.kanban.taskCount", { count })}
    </span>
  );
}

const kanbanResourceType: ResourceTypeDefinition = {
  defaultViewId: KANBAN_PLUGIN_ID,
  icon: KanbanIcon,
  name: "Kanban Board",
  resourceTypeId: KANBAN_PLUGIN_ID,
  schema: {
    currentVersion: 1,
    id: "lunaris.kanban.board",
    read: ({ storage }) =>
      storage.content?.kind === "yjs" ? storage.content.document.toJSON() : {},
    versions: { 1: z.record(z.string(), z.unknown()) },
  },
  storage: {
    content: {
      initialize: (doc) => {
        appendPropertyDefinition(
          doc.getArray<YMap<unknown>>("properties"),
          DEFAULT_STATUS_PROPERTY,
        );
        markPropertiesInitialized(doc);
      },
      kind: "yjs",
    },
  },
};

const kanbanView: ViewDefinition = {
  icon: KanbanIcon,
  name: "Kanban Board",
  preload: kanbanEditorModule.preload,
  renderer: ({ reportReady, resource, storage }: ResourceViewProps) => (
    <Suspense fallback={<KanbanSkeleton />}>
      <KanbanEditor
        resourceId={resource.resourceId}
        reportReady={reportReady}
        storage={storage.content!}
      />
    </Suspense>
  ),
  statusBar: ({ resource }) => (
    <KanbanStatusBar resourceId={resource.resourceId} />
  ),
  storageRequirements: { content: "yjs" },
  target: { kind: "resource", resourceTypeIds: [KANBAN_PLUGIN_ID] },
  viewId: KANBAN_PLUGIN_ID,
};

const kanbanTaskResourceType: ResourceTypeDefinition = {
  defaultViewId: KANBAN_TASK_RESOURCE_TYPE_ID,
  hierarchy: { userCreatable: false, visible: false },
  icon: Task01Icon,
  name: "Kanban Task",
  resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
  schema: {
    currentVersion: 1,
    id: "lunaris.kanban.task",
    read: ({ storage }) =>
      storage.content?.kind === "yjs" ? storage.content.document.toJSON() : {},
    versions: { 1: z.record(z.string(), z.unknown()) },
  },
  storage: {
    content: {
      initialize: (doc, context) => {
        const task = doc.getMap<string>("task");
        const description = context.initialPayload?.description;
        task.set(
          "description",
          typeof description === "string" ? description : "",
        );
        task.set("createdById", context.userId ?? "");
      },
      kind: "yjs",
    },
  },
};

const kanbanTaskView: ViewDefinition = {
  icon: Task01Icon,
  name: "Kanban Task",
  preload: taskEditorModule.preload,
  renderer: ({ reportReady, resource, storage }: ResourceViewProps) => (
    <Suspense fallback={<KanbanSkeleton />}>
      <TaskEditor
        resourceId={resource.resourceId}
        reportReady={reportReady}
        storage={storage.content!}
      />
    </Suspense>
  ),
  storageRequirements: { content: "yjs" },
  target: { kind: "resource", resourceTypeIds: [KANBAN_TASK_RESOURCE_TYPE_ID] },
  viewId: KANBAN_TASK_RESOURCE_TYPE_ID,
};

export const kanbanPlugin = definePlugin({
  manifest,
  activate({ contributions, slots }) {
    contributions.resourceType(kanbanResourceType);
    contributions.resourceType(kanbanTaskResourceType);
    contributions.view(kanbanView);
    contributions.view(kanbanTaskView);
    slots.contribute(kanbanExporterRepresentations, kanbanExporterRepresentation);
    contributions.locales({ de, en, es, fr, "pt-BR": ptBR });
  },
});

export default kanbanPlugin;

export { KANBAN_PLUGIN_ID, KANBAN_TASK_RESOURCE_TYPE_ID };
