import type {
  PluginResource,
  ResourceStorageHandle,
} from "@lunarisapp/plugin-sdk";
import {
  ViewReady,
  createPreloadableLazy,
  useWorkspaceChildrenMap,
  useWorkspaceTrashMap,
  useWorkspaceResourceActions,
  useWorkspaceResourcesMap,
  useOrganizationAccess,
  useOrganizationNavigation,
  useYjsStorage,
} from "@lunarisapp/plugin-sdk";
import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import { RenameDialog } from "@lunarisapp/ui/blocks/rename-dialog";
import { Badge } from "@lunarisapp/ui/components/badge";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@lunarisapp/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@lunarisapp/ui/components/toggle-group";
import { HugeiconsIcon, KanbanIcon, ListViewIcon } from "@lunarisapp/ui/icons";
import posthog from "posthog-js";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { Doc, Map as YMap } from "yjs";
import {
  CreateTaskDialog,
  type CreateTaskInput,
} from "./components/create-task-dialog";
import { PropertyManager } from "./components/property-manager";
import {
  DEFAULT_STATUS_PROPERTY,
  KANBAN_PLUGIN_ID,
  KANBAN_TASK_RESOURCE_TYPE_ID,
  UNASSIGNED_COLUMN_ID,
} from "./constants";
import { useTaskAssignments } from "./hooks";
import { KanbanSkeleton } from "./kanban-skeleton";
import { setTaskPropertyValue } from "./task-assignments";
import {
  appendPropertyDefinition,
  arePropertiesInitialized,
  markPropertiesInitialized,
} from "./property-state";
import type { KanbanTask, PropertyValue } from "./types";
import { useProperties } from "./use-properties";

const listViewModule = createPreloadableLazy(() =>
  import("./components/board-list").then((module) => ({
    default: module.ListView,
  }))
);
const ListView = listViewModule.Component;

const kanbanViewModule = createPreloadableLazy(() =>
  import("./components/board-kanban").then((module) => ({
    default: module.KanbanView,
  }))
);
const KanbanView = kanbanViewModule.Component;

export const preloadKanbanEditor = kanbanViewModule.preload;

type ViewMode = "kanban" | "list";

const STALE_ASSIGNMENT_GRACE_MS = 30_000;

function taskToCard(task: PluginResource): KanbanTask | null {
  if (task.storage.content?.kind !== "yjs") {
    return null;
  }
  return {
    createdAt: task.createdAt ?? undefined,
    id: task.resourceId,
    name: task.name ?? "",
  };
}

export function KanbanEditor({
  storage,
  resourceId,
  reportReady,
}: {
  storage: ResourceStorageHandle;
  resourceId?: string;
  reportReady?: () => void;
}) {
  const { yDoc, isLoading } = useYjsStorage(storage);
  if (isLoading && !yDoc) {
    return <KanbanSkeleton />;
  }
  if (!yDoc) {
    return (
      <PanelError
        description="The board document does not exist or was deleted."
        title="Board not found"
        variant="not-found"
      />
    );
  }
  if (!resourceId) {
    return <PanelError title="Board item not found" variant="not-found" />;
  }

  return (
    <Suspense fallback={<KanbanSkeleton />}>
      <ViewReady reportReady={reportReady}>
        <KanbanContent boardResourceId={resourceId} yDoc={yDoc} />
      </ViewReady>
    </Suspense>
  );
}

function KanbanContent({
  boardResourceId,
  yDoc,
}: {
  boardResourceId: string;
  yDoc: Doc;
}) {
  const { t } = useTranslation();
  const b = useCallback(
    (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`),
    [t]
  );
  const actions = useWorkspaceResourceActions();
  const children = useWorkspaceChildrenMap();
  const items = useWorkspaceResourcesMap();
  const navigation = useOrganizationNavigation();
  const access = useOrganizationAccess();
  const board = items.get(boardResourceId);
  const assignments = useTaskAssignments(yDoc);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [renameTaskId, setRenameTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [groupByPropertyId, setGroupByPropertyId] = useState("status");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);
  const { properties } = useProperties(yDoc);
  const groupingProperties = properties.filter(
    (property) => property.type === "select"
  );
  const activeGroupByPropertyId =
    groupingProperties.find((property) => property.id === groupByPropertyId)
      ?.id ??
    groupingProperties.find((property) => property.id === "status")?.id ??
    groupingProperties[0]?.id ??
    "";

  useEffect(() => {
    if (activeGroupByPropertyId !== groupByPropertyId) {
      setGroupByPropertyId(activeGroupByPropertyId);
    }
  }, [activeGroupByPropertyId, groupByPropertyId]);

  const taskResources = useMemo(
    () =>
      (children.get(boardResourceId) ?? [])
        .filter((item) => item.resourceTypeId === KANBAN_TASK_RESOURCE_TYPE_ID)
        .sort(
          (left, right) =>
            (left.position ?? 0) - (right.position ?? 0) ||
            left.resourceId.localeCompare(right.resourceId)
        ),
    [boardResourceId, children]
  );
  const tasks = useMemo(
    () =>
      taskResources
        .map(taskToCard)
        .filter((task): task is KanbanTask => !!task),
    [taskResources]
  );
  const taskIds = useMemo(
    () => new Set(taskResources.map((task) => task.resourceId)),
    [taskResources]
  );
  const taskIdsRef = useRef(taskIds);
  taskIdsRef.current = taskIds;
  const trash = useWorkspaceTrashMap();
  const renameTask = renameTaskId ? items.get(renameTaskId) : undefined;
  const deleteTask = deleteTaskId ? items.get(deleteTaskId) : undefined;

  useEffect(() => {
    if (!access.canWriteContent) {
      return;
    }
    const properties = yDoc.getArray<YMap<unknown>>("properties");
    if (arePropertiesInitialized(yDoc)) {
      if (properties.length > 0) {
        markPropertiesInitialized(yDoc);
      }
      return;
    }
    yDoc.transact(() => {
      appendPropertyDefinition(properties, DEFAULT_STATUS_PROPERTY);
      markPropertiesInitialized(yDoc);
    });
  }, [access.canWriteContent, yDoc]);

  const assignmentIdsKey = Array.from(assignments.keys()).sort().join("|");

  useEffect(() => {
    if (!access.canWriteContent) {
      return;
    }
    const cleanupCandidates = Array.from(assignments.keys()).filter(
      (taskId) => !(taskIds.has(taskId) || trash.has(taskId))
    );
    if (cleanupCandidates.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      const staleIds = cleanupCandidates.filter(
        (taskId) =>
          assignments.has(taskId) &&
          !taskIdsRef.current.has(taskId) &&
          !trash.has(taskId)
      );
      if (staleIds.length === 0) {
        return;
      }

      yDoc.transact(() => {
        for (const taskId of staleIds) {
          assignments.delete(taskId);
        }
      });
    }, STALE_ASSIGNMENT_GRACE_MS);

    return () => clearTimeout(timeout);
  }, [
    access.canWriteContent,
    assignmentIdsKey,
    assignments,
    taskIds,
    trash,
    yDoc,
  ]);

  useEffect(() => {
    if (renameTaskId && !renameTask) {
      setRenameTaskId(null);
    }
    if (deleteTaskId && !deleteTask) {
      setDeleteTaskId(null);
    }
  }, [deleteTask, deleteTaskId, renameTask, renameTaskId]);

  const changeAssignment = useCallback(
    (taskId: string, propertyId: string, value: PropertyValue | null) => {
      if (!access.canWriteContent) {
        return;
      }
      yDoc.transact(() => {
        setTaskPropertyValue(yDoc, taskId, propertyId, value);
      });
      void actions.touchResource(taskId);
      posthog.capture("kanban_task_property_changed", {
        property_type:
          properties.find((property) => property.id === propertyId)?.type ??
          "unknown",
      });
    },
    [access.canWriteContent, actions, properties, yDoc]
  );

  const openTaskPanel = useCallback(
    (taskId: string) => {
      const task = items.get(taskId);
      if (task?.storage.content?.kind !== "yjs") {
        return;
      }
      navigation.openResource({
        resourceId: task.resourceId,
        resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
        schemaVersion: task.schemaVersion,
        title: task.name?.trim() || b("untitled"),
      });
      posthog.capture("kanban_task_opened", { view_mode: viewMode });
    },
    [b, items, navigation, viewMode]
  );

  const openCreateTaskForGroup = useCallback(
    (groupId: string) => {
      if (!access.canWriteContent) {
        return;
      }
      setTargetColumnId(groupId);
      setDialogOpen(true);
    },
    [access.canWriteContent]
  );

  const initialPropertyValues = useMemo<Record<string, PropertyValue>>(() => {
    if (
      !targetColumnId ||
      targetColumnId === UNASSIGNED_COLUMN_ID ||
      !activeGroupByPropertyId
    ) {
      return {};
    }
    return { [activeGroupByPropertyId]: targetColumnId };
  }, [activeGroupByPropertyId, targetColumnId]);

  const submitTask = async ({
    description,
    name,
    propertyValues,
  }: CreateTaskInput) => {
    if (!access.canWriteContent) {
      return false;
    }
    const result = await actions.createResource({
      resourceTypeId: KANBAN_TASK_RESOURCE_TYPE_ID,
      initialPayload: { description },
      name,
      parentId: boardResourceId,
    });
    if (!result) {
      return false;
    }

    const propertyIds = new Set(properties.map((property) => property.id));
    const entries = Object.entries(propertyValues).filter(([propertyId]) =>
      propertyIds.has(propertyId)
    );
    if (entries.length > 0) {
      yDoc.transact(() => {
        for (const [propertyId, value] of entries) {
          setTaskPropertyValue(yDoc, result.resourceId, propertyId, value);
        }
      });
      void actions.touchResource(result.resourceId);
    }
    posthog.capture("kanban_task_created", {
      added_to_column: Boolean(
        activeGroupByPropertyId && propertyValues[activeGroupByPropertyId]
      ),
      property_count: entries.length,
    });
    return true;
  };

  const confirmDelete = useCallback(async () => {
    if (!(access.canDeleteContent && deleteTaskId && items.has(deleteTaskId))) {
      return;
    }
    const taskId = deleteTaskId;
    setDeleteTaskId(null);
    try {
      await actions.deleteResource(taskId);
    } catch {
      if (items.has(taskId)) {
        setDeleteTaskId(taskId);
      }
      return;
    }
    posthog.capture("kanban_task_deleted", { source: "board_task_menu" });
  }, [access.canDeleteContent, actions, deleteTaskId, items, yDoc]);

  if (!board || board.resourceTypeId !== KANBAN_PLUGIN_ID) {
    return <PanelError title="Board not found" variant="not-found" />;
  }

  return (
    <div className="flex h-full flex-col">
      {access.canWriteContent && renameTaskId && renameTask ? (
        <RenameDialog
          cancelLabel={t("common.cancel")}
          initialName={renameTask.name?.trim() || b("untitled")}
          onOpenChange={(open) => {
            if (!open) {
              setRenameTaskId(null);
            }
          }}
          onSubmit={(name) => {
            const taskId = renameTaskId;
            setRenameTaskId(null);
            void actions.renameResource(taskId, name);
            posthog.capture("kanban_task_renamed", {
              source: "board_task_menu",
            });
          }}
          open
          submitLabel={t("common.save")}
          title={b("renameTask")}
        />
      ) : null}
      {!!access.canDeleteContent && (
        <ConfirmationDialog
          cancelLabel={t("common.cancel")}
          confirmLabel={b("deleteTask")}
          confirmVariant="destructive"
          description={t(
            "extensions.catalog.lunaris.kanban.deleteTaskConfirmation",
            { name: deleteTask?.name?.trim() || b("untitled") }
          )}
          onConfirm={() => void confirmDelete()}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTaskId(null);
            }
          }}
          open={Boolean(deleteTaskId && deleteTask)}
          title={b("deleteTask")}
        />
      )}
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b bg-background px-2 py-2 sm:px-3">
        {access.canWriteContent ? (
          <CreateTaskDialog
            boardName={board.name ?? ""}
            initialPropertyValues={initialPropertyValues}
            onCreate={submitTask}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setTargetColumnId(null);
              }
            }}
            open={dialogOpen}
            properties={properties}
          />
        ) : null}
        {!!access.canWriteContent && <PropertyManager yDoc={yDoc} />}
        {!(access.canDeleteContent || access.canWriteContent) && (
          <Badge variant="outline">
            {t("permissions.readOnlyTitle", { defaultValue: "Read only" })}
          </Badge>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {groupingProperties.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden text-muted-foreground text-xs md:inline">
                {b("groupBy")}
              </span>
              <Select
                onValueChange={(value) => {
                  if (value) {
                    setGroupByPropertyId(value);
                  }
                }}
                value={activeGroupByPropertyId}
              >
                <SelectTrigger
                  aria-label={b("groupBy")}
                  className="min-w-0 max-w-36 sm:max-w-44"
                  size="sm"
                >
                  {groupingProperties.find(
                    (property) => property.id === activeGroupByPropertyId
                  )?.name ?? b("groupBy")}
                </SelectTrigger>
                <SelectContent>
                  {groupingProperties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <ToggleGroup
            onValueChange={(value) => {
              if (value.length > 0) {
                setViewMode(value[0] as ViewMode);
              }
            }}
            size="sm"
            spacing={0}
            value={[viewMode]}
            variant="outline"
          >
            <ToggleGroupItem aria-label={b("kanbanView")} value="kanban">
              <HugeiconsIcon icon={KanbanIcon} size={16} strokeWidth={2} />
            </ToggleGroupItem>
            <ToggleGroupItem aria-label={b("listView")} value="list">
              <HugeiconsIcon icon={ListViewIcon} size={16} strokeWidth={2} />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-muted/15">
        <Suspense fallback={<KanbanSkeleton />}>
          {viewMode === "list" ? (
            <ListView
              assignments={assignments}
              groupByPropertyId={activeGroupByPropertyId}
              onAddTask={openCreateTaskForGroup}
              onPropertyChange={changeAssignment}
              onReorderTasks={(orderedIds) =>
                access.canWriteContent
                  ? actions.reorderResources(boardResourceId, orderedIds)
                  : undefined
              }
              onSelectTask={openTaskPanel}
              readOnly={!access.canWriteContent}
              tasks={tasks}
              yDoc={yDoc}
            />
          ) : (
            <KanbanView
              assignments={assignments}
              canDelete={access.canDeleteContent}
              groupByPropertyId={activeGroupByPropertyId}
              onAddTask={openCreateTaskForGroup}
              onAssignmentChange={changeAssignment}
              onColumnCollapseChange={(mode) =>
                posthog.capture("kanban_column_collapse_changed", { mode })
              }
              onDeleteTask={(resourceId) => {
                if (access.canDeleteContent) {
                  setDeleteTaskId(resourceId);
                }
              }}
              onRenameTask={(resourceId) => {
                if (access.canWriteContent) {
                  setRenameTaskId(resourceId);
                }
              }}
              onReorderTasks={(orderedIds) =>
                access.canWriteContent
                  ? actions.reorderResources(boardResourceId, orderedIds)
                  : undefined
              }
              onSelectTask={openTaskPanel}
              readOnly={!access.canWriteContent}
              tasks={tasks}
              yDoc={yDoc}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
