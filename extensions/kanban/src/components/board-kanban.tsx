import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuSeparator,
  ResponsiveDropdownMenuTrigger,
} from "@lunarisapp/ui/blocks/responsive-dropdown-menu";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanColumnHandle,
  type KanbanCommitMeta,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@lunarisapp/ui/components/kanban";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  HugeiconsIcon,
  MoreVerticalIcon,
} from "@lunarisapp/ui/icons";
import { useCurrentUser, useOrgMembersMap } from "@lunarisapp/plugin-sdk";
import {
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { Doc, Map as YMap } from "yjs";
import { UNASSIGNED_COLUMN_ID } from "../constants";
import { formatPropertyValue, hasPropertyValue } from "../property-codec";
import {
  getPropertyAssignmentKey,
  getTaskPropertyValue,
} from "../task-assignments";
import type {
  KanbanTask,
  ChoicePropertyDefinition,
  PropertyDefinition,
  PropertyOption,
  PropertyValue,
} from "../types";
import { useProperties } from "../use-properties";
import { TaskCreatedAt } from "./task-created-at";
import { PropertyTag } from "./property-tag";

interface KanbanViewProps {
  assignments: YMap<YMap<unknown>>;
  canDelete?: boolean;
  groupByPropertyId: string;
  onAddTask: (columnId: string) => void;
  onAssignmentChange: (
    taskId: string,
    propertyId: string,
    value: PropertyValue | null
  ) => void;
  onColumnCollapseChange?: (mode: ColumnCollapseMode) => void;
  onDeleteTask: (id: string) => void;
  onRenameTask: (id: string) => void;
  onReorderTasks: (orderedIds: string[]) => Promise<void> | void;
  onSelectTask: (id: string) => void;
  readOnly?: boolean;
  tasks: KanbanTask[];
  yDoc: Doc;
}

interface KanbanItemData {
  badges: PropertyBadgeData[];
  createdAt?: string;
  id: string;
  name: string;
}

interface PropertyBadgeData {
  color: string;
  id: string;
  propertyId: string;
  propertyName: string;
  value: string;
}

type ColumnCollapseMode = "expanded" | "horizontal";

function getColumnOrderKey(columns: Record<string, KanbanItemData[]>) {
  return JSON.stringify(
    Object.entries(columns).map(([columnId, items]) => [
      columnId,
      items.map((item) => item.id),
    ])
  );
}

function TaskCard({
  canDelete,
  item,
  createdLabel,
  actionsLabel,
  untitledLabel,
  deleteLabel,
  renameLabel,
  onDelete,
  onRename,
  onSelect,
  readOnly,
}: {
  canDelete: boolean;
  item: KanbanItemData;
  createdLabel: string;
  actionsLabel: string;
  untitledLabel: string;
  deleteLabel: string;
  renameLabel: string;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onSelect?: (id: string) => void;
  readOnly: boolean;
}) {
  return (
    <KanbanItem
      className="group/task data-[dragging=true]:rounded-md data-[dragging=true]:border-2 data-[dragging=true]:border-primary/40 data-[dragging=true]:border-dashed data-[dragging=true]:bg-primary/5"
      disabled={readOnly}
      value={item.id}
    >
      <KanbanItemHandle
        cursor={!readOnly}
        render={
          <div className="flex min-h-20 rounded-lg border border-border/70 bg-card shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 hover:border-foreground/20 hover:shadow-sm" />
        }
      >
        <button
          className="min-w-0 flex-1 cursor-pointer px-3 py-3 text-left outline-none"
          onClick={onSelect ? () => onSelect(item.id) : undefined}
          type="button"
        >
          <span className="block font-medium text-sm">
            {item.name || untitledLabel}
          </span>
          {item.badges.length > 0 ? (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {item.badges.map((badge) => (
                <PropertyTag
                  color={badge.color}
                  key={badge.id}
                  title={`${badge.propertyName}: ${badge.value}`}
                >
                  <span className="truncate">{badge.value}</span>
                </PropertyTag>
              ))}
            </span>
          ) : null}
          <TaskCreatedAt
            className="mt-2 block text-[11px] text-muted-foreground"
            createdAt={item.createdAt}
            prefix={createdLabel}
          />
        </button>
        {!readOnly || canDelete ? (
          <ResponsiveDropdownMenu>
            <ResponsiveDropdownMenuTrigger
              render={
                <Button
                  aria-label={actionsLabel}
                  className="mt-1 mr-1 size-9 shrink-0 text-muted-foreground sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100"
                  onKeyDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    icon={MoreVerticalIcon}
                    size={16}
                    strokeWidth={2}
                  />
                </Button>
              }
            />
            <ResponsiveDropdownMenuContent align="end" title={actionsLabel}>
              {readOnly ? null : (
                <ResponsiveDropdownMenuItem onClick={() => onRename(item.id)}>
                  <HugeiconsIcon icon={Edit02Icon} />
                  {renameLabel}
                </ResponsiveDropdownMenuItem>
              )}
              {canDelete ? (
                <>
                  {readOnly ? null : <ResponsiveDropdownMenuSeparator />}
                  <ResponsiveDropdownMenuItem
                    onClick={() => onDelete(item.id)}
                    variant="destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                    {deleteLabel}
                  </ResponsiveDropdownMenuItem>
                </>
              ) : null}
            </ResponsiveDropdownMenuContent>
          </ResponsiveDropdownMenu>
        ) : null}
      </KanbanItemHandle>
    </KanbanItem>
  );
}

function renderAnimatedColumn(props: ComponentProps<"div">) {
  return (
    <div
      {...props}
      style={{
        ...props.style,
        transition: [props.style?.transition, "width 200ms ease-out"]
          .filter(Boolean)
          .join(", "),
      }}
    />
  );
}

function ColumnView({
  canDelete,
  colId,
  label,
  color,
  items,
  untitledLabel,
  actionsLabel,
  addTaskLabel,
  createdLabel,
  emptyColumnLabel,
  collapseLabel,
  collapseMode,
  deleteLabel,
  expandColumnLabel,
  renameLabel,
  onDeleteTask,
  onRenameTask,
  onSelectTask,
  onAddTask,
  onCollapseModeChange,
  readOnly,
}: {
  canDelete: boolean;
  colId: string;
  label: string;
  color?: string;
  items: KanbanItemData[];
  untitledLabel: string;
  actionsLabel: string;
  addTaskLabel: string;
  createdLabel: string;
  emptyColumnLabel: string;
  collapseLabel: string;
  collapseMode: ColumnCollapseMode;
  deleteLabel: string;
  expandColumnLabel: string;
  renameLabel: string;
  onDeleteTask: (id: string) => void;
  onRenameTask: (id: string) => void;
  onSelectTask?: (id: string) => void;
  onAddTask?: (colId: string) => void;
  onCollapseModeChange: (mode: ColumnCollapseMode) => void;
  readOnly: boolean;
}) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };
  const toggleCollapse = (
    event: MouseEvent<HTMLDivElement>,
    mode: ColumnCollapseMode
  ) => {
    const start = pointerStart.current;
    pointerStart.current = null;

    if (
      event.detail !== 0 &&
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 10
    ) {
      return;
    }

    onCollapseModeChange(mode);
  };

  const addTaskButton = readOnly ? null : (
    <Button
      aria-label={addTaskLabel}
      className="size-9 shrink-0 text-muted-foreground"
      onClick={() => onAddTask?.(colId)}
      size="icon-sm"
      title={addTaskLabel}
      variant="ghost"
    >
      <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
    </Button>
  );

  if (collapseMode === "horizontal") {
    return (
      <KanbanColumn
        className="h-full w-12 shrink-0 snap-start overflow-hidden rounded-lg bg-muted/50 motion-reduce:transition-none!"
        disabled={readOnly}
        render={renderAnimatedColumn}
        value={colId}
      >
        <div className="flex shrink-0 justify-center pt-2">{addTaskButton}</div>
        <KanbanColumnHandle
          aria-label={expandColumnLabel}
          className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 py-3 opacity-100 outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={(event) => toggleCollapse(event, "expanded")}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          onPointerDown={handlePointerDown}
          title={expandColumnLabel}
        >
          <span className="text-muted-foreground text-xs tabular-nums">
            {items.length}
          </span>
          <span className="min-h-0 flex-1 truncate py-2 font-medium text-sm [writing-mode:vertical-rl]">
            {label}
          </span>
        </KanbanColumnHandle>
      </KanbanColumn>
    );
  }

  return (
    <KanbanColumn
      className="h-full w-[min(18rem,calc(100vw-2rem))] shrink-0 snap-start overflow-hidden rounded-xl bg-muted/55 motion-reduce:transition-none! sm:w-[280px]"
      disabled={readOnly}
      render={renderAnimatedColumn}
      value={colId}
    >
      <div className="flex shrink-0 items-center pr-2">
        <KanbanColumnHandle
          aria-label={collapseLabel}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 p-3 pb-2 opacity-100 outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={(event) => toggleCollapse(event, "horizontal")}
          onPointerCancel={() => {
            pointerStart.current = null;
          }}
          onPointerDown={handlePointerDown}
          title={collapseLabel}
        >
          <div className="flex min-w-0 items-center gap-2">
            {!!color && (
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="truncate font-medium text-sm">{label}</span>
            <span className="text-muted-foreground text-xs">
              {items.length}
            </span>
          </div>
        </KanbanColumnHandle>
        {addTaskButton}
      </div>
      {collapseMode === "expanded" ? (
        <KanbanColumnContent
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
          value={colId}
        >
          {items.length === 0 ? (
            <div className="flex min-h-20 items-center justify-center rounded-lg border border-border/70 border-dashed px-3 text-center text-muted-foreground text-xs">
              {emptyColumnLabel}
            </div>
          ) : null}
          {items.map((item) => (
            <TaskCard
              actionsLabel={actionsLabel}
              canDelete={canDelete}
              createdLabel={createdLabel}
              deleteLabel={deleteLabel}
              item={item}
              key={item.id}
              onDelete={onDeleteTask}
              onRename={onRenameTask}
              onSelect={onSelectTask}
              readOnly={readOnly}
              renameLabel={renameLabel}
              untitledLabel={untitledLabel}
            />
          ))}
          {!readOnly && (
            <Button
              className="w-full shrink-0 justify-start text-muted-foreground"
              onClick={() => onAddTask?.(colId)}
              size="sm"
              variant="ghost"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
              {addTaskLabel}
            </Button>
          )}
        </KanbanColumnContent>
      ) : null}
    </KanbanColumn>
  );
}

export function KanbanView({
  assignments,
  canDelete = true,
  yDoc,
  onAddTask,
  onColumnCollapseChange,
  onDeleteTask,
  onRenameTask,
  onReorderTasks,
  onSelectTask,
  onAssignmentChange,
  readOnly = false,
  tasks,
  groupByPropertyId,
}: KanbanViewProps) {
  const { t } = useTranslation();
  const b = useCallback(
    (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`),
    [t]
  );
  const { i18n } = useTranslation();
  const { user: currentUser } = useCurrentUser();
  const { map: members } = useOrgMembersMap();
  const peopleRevision = JSON.stringify([
    currentUser?.id ?? "",
    currentUser?.name ?? "",
    currentUser?.email ?? "",
    ...[...members.entries()].flatMap(([id, user]) => [
      id,
      user.name ?? "",
      user.email ?? "",
    ]),
  ]);
  const { properties, propertyMaps } = useProperties(yDoc);
  const [collapseModes, setCollapseModes] = useState<
    Record<string, ColumnCollapseMode>
  >({});

  const property = properties.find(
    (candidate): candidate is ChoicePropertyDefinition =>
      candidate.id === groupByPropertyId && candidate.type === "select"
  );
  const propertyYMap = propertyMaps.find(
    (candidate) => candidate.get("id") === groupByPropertyId
  );

  const propKey = getPropertyAssignmentKey(groupByPropertyId);

  const itemsRevision = JSON.stringify(
    tasks.map((task) => {
      const assignment = assignments.get(task.id);
      return [
        task.id,
        task.name,
        task.createdAt ?? "",
        ...properties.map(
          (taskProperty) =>
            assignment?.get(getPropertyAssignmentKey(taskProperty.id)) ?? ""
        ),
      ];
    })
  );

  const yesLabel = b("boolean.yes");
  const noLabel = b("boolean.no");
  const untitledLabel = b("untitled");
  // biome-ignore lint/correctness/useExhaustiveDependencies: peopleRevision captures IDs/names/emails; unstable host map wrappers must not invalidate the drag preview.
  const grouped = useMemo<Record<string, KanbanItemData[]>>(() => {
    const options = property?.options ?? [];
    const result: Record<string, KanbanItemData[]> = {};
    const allProperties = properties.filter(
      (itemProperty) => itemProperty.id !== groupByPropertyId
    );

    result[UNASSIGNED_COLUMN_ID] = [];
    for (const opt of options) {
      result[opt.id] = [];
    }

    for (const task of tasks) {
      const assignment = assignments.get(task.id);
      const item: KanbanItemData = {
        badges: allProperties.flatMap((itemProperty) =>
          propertyBadges(
            itemProperty,
            getTaskPropertyValue(assignment, itemProperty),
            (id) => {
              const user =
                id === currentUser?.id ? currentUser : members.get(id);
              return user?.name || user?.email || id;
            },
            i18n.language,
            yesLabel,
            noLabel
          )
        ),
        createdAt: task.createdAt,
        id: task.id,
        name: task.name || untitledLabel,
      };
      const val = assignment?.get(propKey);
      if (typeof val === "string" && val && result[val]) {
        result[val].push(item);
      } else {
        result[UNASSIGNED_COLUMN_ID].push(item);
      }
    }

    return result;
  }, [
    assignments,
    groupByPropertyId,
    i18n.language,
    itemsRevision,
    peopleRevision,
    yesLabel,
    noLabel,
    untitledLabel,
    properties,
    property?.options,
    propKey,
    tasks,
  ]);

  const columnOrder = useMemo<string[]>(() => {
    const options = property?.options ?? [];
    return [UNASSIGNED_COLUMN_ID, ...options.map((o) => o.id)];
  }, [property?.options]);

  const [preview, setPreview] = useState<{
    base: Record<string, KanbanItemData[]>;
    committed: boolean;
    value: Record<string, KanbanItemData[]>;
  } | null>(null);
  const displayedColumns =
    preview && (preview.base === grouped || preview.committed)
      ? preview.value
      : grouped;
  const groupedOrderKey = getColumnOrderKey(grouped);
  const previewOrderKey = preview ? getColumnOrderKey(preview.value) : null;

  useEffect(() => {
    if (preview?.committed && previewOrderKey === groupedOrderKey) {
      setPreview(null);
    }
  }, [groupedOrderKey, preview?.committed, previewOrderKey]);

  const optionsMap = useMemo<Record<string, PropertyOption>>(() => {
    const map: Record<string, PropertyOption> = {};
    for (const opt of property?.options ?? []) {
      map[opt.id] = opt;
    }
    return map;
  }, [property?.options]);

  const getItemValue = useCallback((item: KanbanItemData) => item.id, []);

  const persistTaskOrder = useCallback(
    (nextGrouped: Record<string, KanbanItemData[]>) => {
      const orderedIds = columnOrder.flatMap((columnId) =>
        (nextGrouped[columnId] ?? []).map((item) => item.id)
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
    (newValue: Record<string, KanbanItemData[]>) => {
      if (readOnly) {
        return;
      }
      setPreview({ base: grouped, committed: false, value: newValue });
    },
    [grouped, readOnly]
  );

  const handleValueCommit = useCallback(
    (
      newValue: Record<string, KanbanItemData[]>,
      meta: KanbanCommitMeta<KanbanItemData>
    ) => {
      if (readOnly) {
        return;
      }

      setPreview((current) => ({
        base: current?.value === newValue ? current.base : grouped,
        committed: true,
        value: newValue,
      }));

      if (meta.kind === "column") {
        if (!propertyYMap) {
          setPreview(null);
          return;
        }
        const options = property?.options ?? [];
        const reordered = Object.keys(newValue)
          .filter((id) => id !== UNASSIGNED_COLUMN_ID)
          .map((id) => options.find((option) => option.id === id))
          .filter((option): option is PropertyOption => Boolean(option));
        yDoc.transact(() => {
          propertyYMap.set("options", JSON.stringify(reordered));
        });
        setPreview(null);
        return;
      }

      const item = meta.previousValue[meta.activeContainer]?.[meta.activeIndex];
      if (!item) {
        return;
      }
      if (meta.activeContainer !== meta.overContainer) {
        onAssignmentChange(
          item.id,
          groupByPropertyId,
          meta.overContainer === UNASSIGNED_COLUMN_ID
            ? null
            : meta.overContainer
        );
      }
      const reorder = persistTaskOrder(newValue);
      if (!reorder) {
        setPreview((current) => (current?.value === newValue ? null : current));
        return;
      }
      void reorder.catch(() => {
        setPreview((current) => (current?.value === newValue ? null : current));
      });
    },
    [
      groupByPropertyId,
      grouped,
      onAssignmentChange,
      persistTaskOrder,
      property?.options,
      propertyYMap,
      readOnly,
      yDoc,
    ]
  );

  const unassignedLabel = b("unassigned");
  const getColumnLabel = useCallback(
    (colId: string) => {
      if (colId === UNASSIGNED_COLUMN_ID) {
        return unassignedLabel;
      }
      return optionsMap[colId]?.name ?? colId;
    },
    [optionsMap, unassignedLabel]
  );

  return (
    <Kanban<KanbanItemData>
      className="h-full"
      getItemValue={getItemValue}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      restoreOnCancel
      value={displayedColumns}
    >
      <KanbanBoard className="flex h-full w-max snap-x snap-mandatory scroll-px-3 items-start gap-3 p-3 sm:scroll-px-4 sm:grid-cols-none sm:p-4">
        {Object.keys(displayedColumns).map((colId) => {
          const option = optionsMap[colId];
          const label = getColumnLabel(colId);
          const color = option?.color;
          const items = displayedColumns[colId] ?? [];

          return (
            <ColumnView
              actionsLabel={b("taskActions")}
              addTaskLabel={b("addTaskToColumn")}
              canDelete={canDelete}
              colId={colId}
              collapseLabel={b("collapseColumn")}
              collapseMode={collapseModes[colId] ?? "expanded"}
              color={color}
              createdLabel={b("created")}
              emptyColumnLabel={b("emptyColumn")}
              deleteLabel={b("deleteTask")}
              expandColumnLabel={b("expandColumn")}
              items={items}
              key={colId}
              label={label}
              onAddTask={onAddTask}
              onCollapseModeChange={(mode) => {
                onColumnCollapseChange?.(mode);
                setCollapseModes((current) => ({
                  ...current,
                  [colId]: mode,
                }));
              }}
              onDeleteTask={onDeleteTask}
              onRenameTask={onRenameTask}
              onSelectTask={onSelectTask}
              readOnly={readOnly}
              renameLabel={b("renameTask")}
              untitledLabel={b("untitled")}
            />
          );
        })}
      </KanbanBoard>
      <KanbanOverlay className="rounded-md border-2 border-dashed bg-muted/10">
        <div className="size-full" />
      </KanbanOverlay>
    </Kanban>
  );
}

function propertyBadges(
  property: PropertyDefinition,
  value: PropertyValue | undefined,
  resolvePerson: (id: string) => string,
  locale: string,
  booleanTrue: string,
  booleanFalse: string
): PropertyBadgeData[] {
  if (!hasPropertyValue(value)) {
    return [];
  }
  if (property.type === "select" && typeof value === "string") {
    const option = property.options.find((candidate) => candidate.id === value);
    return option
      ? [
          {
            color: option.color,
            id: `${property.id}:${option.id}`,
            propertyId: property.id,
            propertyName: property.name,
            value: option.name,
          },
        ]
      : [];
  }
  if (property.type === "multi-select" && Array.isArray(value)) {
    return value.flatMap((id) => {
      const option = property.options.find((candidate) => candidate.id === id);
      return option
        ? [
            {
              color: option.color,
              id: `${property.id}:${option.id}`,
              propertyId: property.id,
              propertyName: property.name,
              value: option.name,
            },
          ]
        : [];
    });
  }
  const formatted = formatPropertyValue(property, value, {
    booleanFalse,
    booleanTrue,
    locale,
    resolvePerson,
  });
  return formatted
    ? [
        {
          color: "#6b7280",
          id: property.id,
          propertyId: property.id,
          propertyName: property.name,
          value: formatted,
        },
      ]
    : [];
}
