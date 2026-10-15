import type { PluginResource, ResourceStorageHandle } from "@lunarisapp/plugin-sdk";
import {
  ViewReady,
  useWorkspaceResourceActions,
  useWorkspaceResourcesMap,
  useOrganizationAccess,
  useOrganizationNavigation,
  useYjsStorage,
} from "@lunarisapp/plugin-sdk";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import posthog from "posthog-js";
import { useCallback } from "react";
import type { Doc } from "yjs";
import {
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
} from "../constants";
import { useTaskAssignments } from "../hooks";
import { KanbanSkeleton } from "../kanban-skeleton";
import {
  setTaskPropertyValue,
} from "../task-assignments";
import type { PropertyValue } from "../types";
import { useProperties } from "../use-properties";
import { TaskDetail } from "./task-detail";

export function TaskEditor({
  storage,
  resourceId,
  reportReady,
}: {
  storage: ResourceStorageHandle;
  resourceId?: string;
  reportReady?: () => void;
}) {
  const items = useWorkspaceResourcesMap();
  const task = resourceId ? items.get(resourceId) : undefined;
  const board = task?.parentId ? items.get(task.parentId) : undefined;

  if (!task || task.resourceTypeId !== KANBAN_TASK_RESOURCE_TYPE_ID) {
    return <PanelError title="Task not found" variant="not-found" />;
  }
  if (task.storage.content?.storageId !== storage.storageId) {
    return (
      <PanelError
        description="The task document is missing."
        title="Task not found"
        variant="not-found"
      />
    );
  }
  if (
    !board ||
    board.resourceTypeId !== KANBAN_PLUGIN_ID ||
    board.storage.content?.kind !== "yjs"
  ) {
    return (
      <PanelError
        description="This task is no longer attached to a Kanban board."
        title="Board not found"
        variant="not-found"
      />
    );
  }

  return (
    <TaskDocuments board={board} reportReady={reportReady} task={task} />
  );
}

function TaskDocuments({
  board,
  reportReady,
  task,
}: {
  board: PluginResource;
  reportReady?: () => void;
  task: PluginResource;
}) {
  const taskDocument = useYjsStorage(task.storage.content);
  const boardDocument = useYjsStorage(board.storage.content);

  if (
    (taskDocument.isLoading && !taskDocument.yDoc) ||
    (boardDocument.isLoading && !boardDocument.yDoc)
  ) {
    return <KanbanSkeleton />;
  }
  if (!taskDocument.yDoc || !boardDocument.yDoc) {
    return (
      <PanelError
        description="The task or its parent board document is missing."
        title="Task not found"
        variant="not-found"
      />
    );
  }

  return (
    <ViewReady reportReady={reportReady}>
      <TaskDetailContent
        board={board}
        boardDoc={boardDocument.yDoc}
        task={task}
        taskDoc={taskDocument.yDoc}
      />
    </ViewReady>
  );
}

function TaskDetailContent({
  board,
  boardDoc,
  task,
  taskDoc,
}: {
  board: PluginResource;
  boardDoc: Doc;
  task: PluginResource;
  taskDoc: Doc;
}) {
  const actions = useWorkspaceResourceActions();
  const access = useOrganizationAccess();
  const navigation = useOrganizationNavigation();
  const assignments = useTaskAssignments(boardDoc);
  const { properties } = useProperties(boardDoc);

  const changeProperty = useCallback(
    (propertyId: string, value: PropertyValue | null) => {
      if (!access.canWriteContent) return;
      boardDoc.transact(() => {
        setTaskPropertyValue(boardDoc, task.resourceId, propertyId, value);
      });
      void actions.touchResource(task.resourceId);
      posthog.capture("kanban_task_property_changed", {
        property_type:
          properties.find((property) => property.id === propertyId)?.type ??
          "unknown",
      });
    },
    [access.canWriteContent, actions, boardDoc, properties, task.resourceId]
  );

  return (
    <TaskDetail
      assignment={assignments.get(task.resourceId)}
      boardDoc={boardDoc}
      boardName={board.name ?? ""}
      onOpenBoard={(title) =>
        navigation.openResource({
          resourceId: board.resourceId,
          resourceTypeId: KANBAN_PLUGIN_ID,
          schemaVersion: board.schemaVersion,
          title,
        })
      }
      onPropertyChange={
        access.canWriteContent ? changeProperty : undefined
      }
      onRename={
        access.canWriteContent
          ? (name) => void actions.renameResource(task.resourceId, name)
          : undefined
      }
      readOnly={!access.canWriteContent}
      task={task}
      taskDoc={taskDoc}
    />
  );
}
