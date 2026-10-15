import {
  useCurrentUser,
  useOrgMembersMap,
} from "@lunarisapp/plugin-sdk";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  type KanbanCommitMeta,
  KanbanOverlay,
} from "@lunarisapp/ui/components/kanban";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Doc, Map as YMap } from "yjs";
import { UNASSIGNED_COLUMN_ID } from "../constants";
import { getTaskPropertyValue } from "../task-assignments";
import type {
  ChoicePropertyDefinition,
  KanbanTask,
  PropertyValue,
} from "../types";
import { useProperties } from "../use-properties";
import {
  getListGridStyle,
  getPropertyColumnWidth,
  ListPropertyLabels,
  type ListRowSharedProps,
  type ListTaskGroup,
  ListTaskGroupSection,
  ListTaskRows,
} from "./board-list-section";

interface ListViewProps {
  assignments: YMap<YMap<unknown>>;
  groupByPropertyId: string;
  onAddTask: (groupId: string) => void;
  onPropertyChange: (
    taskId: string,
    propertyId: string,
    value: PropertyValue | null
  ) => void;
  onReorderTasks: (orderedIds: string[]) => Promise<void> | void;
  onSelectTask: (id: string) => void;
  readOnly?: boolean;
  tasks: KanbanTask[];
  yDoc: Doc;
}

const UNGROUPED_SECTION_ID = "__ungrouped_list__";

function getGroupedOrderKey(grouped: Record<string, KanbanTask[]>): string {
  return JSON.stringify(
    Object.entries(grouped).map(([groupId, groupTasks]) => [
      groupId,
      groupTasks.map((task) => task.id),
    ])
  );
}

export function ListView({
  assignments,
  groupByPropertyId,
  onAddTask,
  onPropertyChange,
  onReorderTasks,
  onSelectTask,
  readOnly = false,
  tasks,
  yDoc,
}: ListViewProps) {
  const { t } = useTranslation();
  const b = (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`);
  const { properties } = useProperties(yDoc);
  const groupProperty = properties.find(
    (property): property is ChoicePropertyDefinition =>
      property.id === groupByPropertyId && property.type === "select"
  );
  const { user: currentUser } = useCurrentUser();
  const { map: members } = useOrgMembersMap();
  const people = useMemo(() => {
    const result = new Map(members);
    if (currentUser?.id) result.set(currentUser.id, currentUser);
    return result;
  }, [currentUser, members]);

  const unassignedLabel = b("unassigned");
  const groupAssignmentRevision = JSON.stringify(
    tasks.map((task) => [
      task.id,
      groupProperty
        ? getTaskPropertyValue(assignments.get(task.id), groupProperty)
        : null,
    ])
  );
  const groups = useMemo(
    () =>
      groupProperty
        ? createTaskGroups(
            tasks,
            assignments,
            groupProperty,
            unassignedLabel
          )
        : undefined,
    [
      assignments,
      groupAssignmentRevision,
      groupProperty,
      tasks,
      unassignedLabel,
    ]
  );
  const grouped = useMemo<Record<string, KanbanTask[]>>(
    () =>
      groups
        ? Object.fromEntries(groups.map((group) => [group.id, group.data]))
        : { [UNGROUPED_SECTION_ID]: tasks },
    [groups, tasks]
  );
  const columnOrder = useMemo(
    () => groups?.map((group) => group.id) ?? [UNGROUPED_SECTION_ID],
    [groups]
  );
  const [preview, setPreview] = useState<{
    base: Record<string, KanbanTask[]>;
    committed: boolean;
    value: Record<string, KanbanTask[]>;
  } | null>(null);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set()
  );
  const displayedColumns =
    preview && (preview.base === grouped || preview.committed)
      ? preview.value
      : grouped;
  const groupedOrderKey = getGroupedOrderKey(grouped);
  const previewOrderKey = preview ? getGroupedOrderKey(preview.value) : null;

  useEffect(() => {
    if (preview?.committed && previewOrderKey === groupedOrderKey) {
      setPreview(null);
    }
  }, [groupedOrderKey, preview?.committed, previewOrderKey]);

  const getItemValue = useCallback((task: KanbanTask) => task.id, []);
  const persistTaskOrder = useCallback(
    (nextGrouped: Record<string, KanbanTask[]>) => {
      const orderedIds = columnOrder.flatMap((columnId) =>
        (nextGrouped[columnId] ?? []).map((task) => task.id)
      );
      const currentIds = tasks.map((task) => task.id);
      if (
        orderedIds.length === currentIds.length &&
        orderedIds.some((id, index) => id !== currentIds[index])
      ) {
        return onReorderTasks(orderedIds);
      }
    },
    [columnOrder, onReorderTasks, tasks]
  );
  const handleValueChange = useCallback(
    (value: Record<string, KanbanTask[]>) => {
      if (readOnly) return;
      setPreview({ base: grouped, committed: false, value });
    },
    [grouped, readOnly]
  );
  const handleValueCommit = useCallback(
    (
      value: Record<string, KanbanTask[]>,
      meta: KanbanCommitMeta<KanbanTask>
    ) => {
      if (readOnly || meta.kind === "column") return;
      setPreview((current) => ({
        base: current?.value === value ? current.base : grouped,
        committed: true,
        value,
      }));

      const task =
        meta.previousValue[meta.activeContainer]?.[meta.activeIndex];
      if (!task) return;
      if (groupProperty && meta.activeContainer !== meta.overContainer) {
        onPropertyChange(
          task.id,
          groupProperty.id,
          meta.overContainer === UNASSIGNED_COLUMN_ID
            ? null
            : meta.overContainer
        );
      }

      const reorder = persistTaskOrder(value);
      if (!reorder) {
        setPreview((current) => (current?.value === value ? null : current));
        return;
      }
      void reorder.catch(() => {
        setPreview((current) => (current?.value === value ? null : current));
      });
    },
    [
      grouped,
      groupProperty,
      onPropertyChange,
      persistTaskOrder,
      readOnly,
    ]
  );
  const listProperties = properties.filter(
    (property) => property.id !== groupProperty?.id
  );
  const propertyColumnWidths = listProperties.map(getPropertyColumnWidth);
  const gridStyle = getListGridStyle(propertyColumnWidths);
  const rowProps = {
    assignments,
    gridStyle,
    onPropertyChange,
    onSelectTask,
    people,
    properties: listProperties,
    readOnly,
    reorderTaskLabel: (name) =>
      t("extensions.catalog.lunaris.kanban.reorderTask", { name }),
    untitledLabel: b("untitled"),
  } satisfies ListRowSharedProps;

  return (
    <Kanban<KanbanTask>
      className="h-full"
      getItemValue={getItemValue}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      restoreOnCancel
      value={displayedColumns}
    >
      <div className="h-full overflow-auto overscroll-contain p-2 sm:p-3">
        <KanbanBoard
          className="block min-h-full w-full"
          style={{
            minWidth: `${16 + propertyColumnWidths.reduce((sum, width) => sum + width, 0)}rem`,
          }}
        >
          {tasks.length > 0 && listProperties.length > 0 ? (
            <div className="grid min-h-7 items-center" style={gridStyle}>
              <span aria-hidden="true" />
              <ListPropertyLabels properties={listProperties} />
            </div>
          ) : null}
          {groups && (tasks.length > 0 || !readOnly) ? (
            groups.map((group) => {
              const collapseKey = `${groupProperty?.id ?? ""}:${group.id}`;
              return (
                <ListTaskGroupSection
                  {...rowProps}
                  addTaskLabel={t(
                    "extensions.catalog.lunaris.kanban.addTaskToSection",
                    { name: group.label }
                  )}
                  collapseLabel={t(
                    "extensions.catalog.lunaris.kanban.collapseSection",
                    { name: group.label }
                  )}
                  collapsed={collapsedGroupKeys.has(collapseKey)}
                  expandLabel={t(
                    "extensions.catalog.lunaris.kanban.expandSection",
                    { name: group.label }
                  )}
                  group={group}
                  taskCountLabel={t(
                    "extensions.catalog.lunaris.kanban.taskCount",
                    { count: (displayedColumns[group.id] ?? []).length }
                  )}
                  key={collapseKey}
                  onAddTask={() => onAddTask(group.id)}
                  onToggle={() => {
                    setCollapsedGroupKeys((current) => {
                      const next = new Set(current);
                      if (next.has(collapseKey)) next.delete(collapseKey);
                      else next.add(collapseKey);
                      return next;
                    });
                  }}
                  tasks={displayedColumns[group.id] ?? []}
                />
              );
            })
          ) : tasks.length > 0 ? (
            <KanbanColumn
              className="pt-2 opacity-100!"
              value={UNGROUPED_SECTION_ID}
            >
              <ListTaskRows
                {...rowProps}
                groupId={UNGROUPED_SECTION_ID}
                tasks={displayedColumns[UNGROUPED_SECTION_ID] ?? []}
              />
            </KanbanColumn>
          ) : (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {b(readOnly ? "noTasksReadOnly" : "noTasks")}
            </div>
          )}
        </KanbanBoard>
      </div>
      <KanbanOverlay>
        {({ value }) => {
          const task = tasks.find((candidate) => candidate.id === value);
          return task ? (
            <div className="w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border/70 bg-background px-3 py-2 text-sm font-medium shadow-md">
              <span className="block truncate">
                {task.name || b("untitled")}
              </span>
            </div>
          ) : null;
        }}
      </KanbanOverlay>
    </Kanban>
  );
}

function createTaskGroups(
  tasks: KanbanTask[],
  assignments: YMap<YMap<unknown>>,
  property: ChoicePropertyDefinition,
  unassignedLabel: string
): ListTaskGroup[] {
  const tasksByGroup = new Map<string, KanbanTask[]>();
  tasksByGroup.set(UNASSIGNED_COLUMN_ID, []);
  for (const option of property.options) tasksByGroup.set(option.id, []);

  for (const task of tasks) {
    const value = getTaskPropertyValue(assignments.get(task.id), property);
    const groupId =
      typeof value === "string" && tasksByGroup.has(value)
        ? value
        : UNASSIGNED_COLUMN_ID;
    tasksByGroup.get(groupId)?.push(task);
  }

  return [
    { color: undefined, id: UNASSIGNED_COLUMN_ID, label: unassignedLabel },
    ...property.options.map((option) => ({
      color: option.color,
      id: option.id,
      label: option.name,
    })),
  ].map((option) => ({
    ...option,
    data: tasksByGroup.get(option.id) ?? [],
  }));
}
