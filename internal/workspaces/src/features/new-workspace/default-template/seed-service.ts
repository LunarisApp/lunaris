import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import type { Database } from "@repo/data/core";
import {
  createWorkspaceExtensionsService,
  DEFAULT_EXCALIDRAW_EXTENSION,
  replaceWorkspaceExtensions,
} from "@repo/data/features/workspace-extensions";
import {
  createWorkspaceFolder,
  createWorkspaceResource,
} from "@repo/data/features/workspace-resources";
import { createWorkspace } from "@repo/data/features/workspaces";
import { getStorageSlot } from "@repo/data/features/workspace-storage-slots";
import {
  b64ToUint8Array,
  insertYjsDocumentUpdate,
} from "@repo/data/features/yjs";
import { log } from "evlog";
import { applyUpdateV2 } from "yjs";
import type { ResourceCapacityReservation } from "@repo/features/entitlements";
import documentTemplate from "./assets/Examples/Document.json";
import excalidrawTemplate from "./assets/Examples/Excalidraw.json";
import kanbanTemplate from "./assets/Examples/Kanban.json";
import welcomeTemplate from "./assets/Welcome.json";
import {
  createExcalidrawTemplateUpdate,
  createKanbanTaskTemplateUpdate,
  createKanbanTemplateUpdate,
  createRichTextTemplateUpdate,
} from "./template-converters";
export { DEFAULT_TEMPLATE_ITEM_COUNT } from "./seed-metadata";

export const DEFAULT_TEMPLATE_WORKSPACE_NAME = "Welcome to Lunaris";
export const DEFAULT_TEMPLATE_WORKSPACE_SLUG = "welcome";
const RICH_TEXT_PLUGIN_ID = "lunaris.rich-text";
const KANBAN_PLUGIN_ID = "lunaris.kanban";
const KANBAN_TASK_PLUGIN_ID = "lunaris.kanban.task";
const EXCALIDRAW_PLUGIN_ID = "lunaris.excalidraw";
const DEFAULT_TEMPLATE_BUNDLED_PLUGIN_IDS = [
  RICH_TEXT_PLUGIN_ID,
  KANBAN_PLUGIN_ID,
] as const;

async function createSeededYjsItem(params: {
  db: Database;
  name: string;
  parentId: string | null;
  pluginId: string;
  position: number;
  workspaceId: string;
  onItemCreated: () => void;
  updateB64: string;
}) {
  const {
    db,
    name,
    onItemCreated,
    parentId,
    pluginId,
    position,
    workspaceId,
    updateB64,
  } = params;
  const item = await createWorkspaceResource({
    db,
    name,
    parentId,
    resourceTypeId: pluginId,
    schemaVersion: 1,
    position,
    workspaceId,
    storage: {
      content: {
        kind: "yjs",
        initialize: (doc) => applyUpdateV2(doc, b64ToUint8Array(updateB64)),
      },
    },
  });
  onItemCreated();
  return item;
}

export async function seedDefaultTemplateWorkspace(params: {
  db: Database;
  resourceCapacityReservation: ResourceCapacityReservation;
  organizationId: string;
}) {
  const { db, resourceCapacityReservation, organizationId } = params;
  let createdResourceCount = 0;
  const onItemCreated = () => {
    createdResourceCount += 1;
  };

  try {
    const workspaceId = await createWorkspace({
      db,
      name: DEFAULT_TEMPLATE_WORKSPACE_NAME,
      organizationId,
      slug: DEFAULT_TEMPLATE_WORKSPACE_SLUG,
      visibility: WORKSPACE_VISIBILITY.local,
    });

    await replaceWorkspaceExtensions({
      db,
      enabledExtensionIds: DEFAULT_TEMPLATE_BUNDLED_PLUGIN_IDS,
      workspaceId,
    });
    await createWorkspaceExtensionsService(db, workspaceId).install(
      EXCALIDRAW_PLUGIN_ID,
      DEFAULT_EXCALIDRAW_EXTENSION,
      {
        defaultExtensionIds: DEFAULT_TEMPLATE_BUNDLED_PLUGIN_IDS,
        knownExtensionIds: [
          ...DEFAULT_TEMPLATE_BUNDLED_PLUGIN_IDS,
          EXCALIDRAW_PLUGIN_ID,
        ],
      },
    );

    await createSeededYjsItem({
      db,
      name: "Welcome",
      onItemCreated,
      parentId: null,
      pluginId: RICH_TEXT_PLUGIN_ID,
      position: 0,
      workspaceId,
      updateB64: createRichTextTemplateUpdate(welcomeTemplate),
    });

    const examplesFolderId = await createWorkspaceFolder({
      db,
      name: "Product Launch Example",
      parentId: null,
      position: 1,
      workspaceId,
    });
    onItemCreated();

    await createSeededYjsItem({
      db,
      name: "Workspace Brief",
      onItemCreated,
      parentId: examplesFolderId,
      pluginId: RICH_TEXT_PLUGIN_ID,
      position: 0,
      workspaceId,
      updateB64: createRichTextTemplateUpdate(documentTemplate),
    });
    const kanbanItem = await createSeededYjsItem({
      db,
      name: "Launch Plan",
      onItemCreated,
      parentId: examplesFolderId,
      pluginId: KANBAN_PLUGIN_ID,
      position: 1,
      workspaceId,
      updateB64: createKanbanTemplateUpdate({
        items: [],
        properties: kanbanTemplate.properties,
      }),
    });
    const seededKanbanTasks: Array<
      (typeof kanbanTemplate.items)[number]
    > = [];
    for (const [position, taskTemplate] of kanbanTemplate.items.entries()) {
      const task = await createSeededYjsItem({
        db,
        name: taskTemplate.name,
        onItemCreated,
        parentId: kanbanItem.id,
        pluginId: KANBAN_TASK_PLUGIN_ID,
        position,
        workspaceId,
        updateB64: createKanbanTaskTemplateUpdate({
          description: taskTemplate.description,
        }),
      });
      seededKanbanTasks.push({ ...taskTemplate, id: task.id });
    }
    const kanbanContentHandle = kanbanItem.storage.content;
    if (!kanbanContentHandle || kanbanContentHandle.kind !== "yjs") {
      throw new Error("Seeded Kanban content handle is missing");
    }
    const kanbanContent = await getStorageSlot(db, kanbanContentHandle.storageId);
    if (!kanbanContent?.backing_id || kanbanContent.kind !== "yjs") {
      throw new Error("Seeded Kanban content slot is missing");
    }
    await insertYjsDocumentUpdate(
      db,
      kanbanContent.backing_id,
      workspaceId,
      createKanbanTemplateUpdate({
        items: seededKanbanTasks,
        properties: [],
      }),
      null
    );
    await createSeededYjsItem({
      db,
      name: "Launch Workflow",
      onItemCreated,
      parentId: examplesFolderId,
      pluginId: EXCALIDRAW_PLUGIN_ID,
      position: 2,
      workspaceId,
      updateB64: createExcalidrawTemplateUpdate(excalidrawTemplate),
    });

    log.info({
      tag: "Workspace",
      msg: "default template seeded",
      workspaceId,
    });
    resourceCapacityReservation.commit();
    return workspaceId;
  } catch (error) {
    resourceCapacityReservation.commit(createdResourceCount);
    resourceCapacityReservation.rollback();
    throw error;
  }
}
