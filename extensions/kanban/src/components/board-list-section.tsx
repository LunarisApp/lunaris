import type { PluginUser } from "@lunarisapp/plugin-sdk";
import {
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
} from "@lunarisapp/ui/components/kanban";
import {
  Add01Icon,
  ArrowDown01Icon,
  DragDropVerticalIcon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import { type CSSProperties, useId } from "react";
import type { Map as YMap } from "yjs";
import { getTaskPropertyValue } from "../task-assignments";
import type {
  KanbanTask,
  PropertyDefinition,
  PropertyValue,
} from "../types";
import { getPropertyTagStyle } from "./property-tag";
import { PropertyValueField } from "./property-value-field";

export interface ListTaskGroup {
  color?: string;
  data: KanbanTask[];
  id: string;
  label: string;
}

export interface ListRowSharedProps {
  assignments: YMap<YMap<unknown>>;
  gridStyle: CSSProperties;
  onPropertyChange: (
    taskId: string,
    propertyId: string,
    value: PropertyValue | null
  ) => void;
  onSelectTask: (id: string) => void;
  people: Map<string, PluginUser>;
  properties: PropertyDefinition[];
  readOnly: boolean;
  reorderTaskLabel: (name: string) => string;
  untitledLabel: string;
}

interface ListTaskGroupSectionProps extends ListRowSharedProps {
  addTaskLabel: string;
  collapsed: boolean;
  collapseLabel: string;
  expandLabel: string;
  group: ListTaskGroup;
  onAddTask: () => void;
  onToggle: () => void;
  taskCountLabel: string;
  tasks: KanbanTask[];
}

interface ListTaskRowsProps extends ListRowSharedProps {
  contentId?: string;
  groupId: string;
  tasks: KanbanTask[];
}

export function ListTaskGroupSection({
  addTaskLabel,
  collapseLabel,
  collapsed,
  expandLabel,
  group,
  taskCountLabel,
  onAddTask,
  onToggle,
  tasks,
  ...rowProps
}: ListTaskGroupSectionProps) {
  const headingId = useId();
  const contentId = `${headingId}-content`;

  return (
    <KanbanColumn
      aria-labelledby={headingId}
      className="opacity-100!"
      render={<section />}
      value={group.id}
    >
      <div className="pt-3 pb-1">
        <div
          className="flex min-h-9 items-stretch rounded-lg border border-border/60 bg-muted/45 text-xs transition-opacity hover:opacity-90"
          style={group.color ? getPropertyTagStyle(group.color) : undefined}
        >
          <h3 className="min-w-0 flex-1">
            <button
              aria-controls={contentId}
              aria-expanded={!collapsed}
              aria-label={collapsed ? expandLabel : collapseLabel}
              className="group/section flex h-full min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:ring-inset"
              onClick={onToggle}
              type="button"
            >
              <HugeiconsIcon
                className={`shrink-0 opacity-60 transition-[transform,opacity] group-hover/section:opacity-100 ${collapsed ? "-rotate-90" : ""}`}
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={2}
              />
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
                style={
                  group.color ? { backgroundColor: group.color } : undefined
                }
              />
              <span
                className="min-w-0 flex-1 truncate text-left font-medium"
                id={headingId}
              >
                {group.label}
              </span>
              <span
                aria-label={taskCountLabel}
                className="shrink-0 rounded-md border border-current/10 bg-background/45 px-1.5 py-0.5 text-[11px] leading-none tabular-nums opacity-70"
              >
                {tasks.length}
              </span>
            </button>
          </h3>
          {rowProps.readOnly ? null : (
            <button
              aria-label={addTaskLabel}
              className="m-1 flex size-8 shrink-0 items-center justify-center rounded-md text-current opacity-60 outline-none transition-[background-color,opacity] hover:bg-background/45 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current/40 sm:size-7"
              onClick={onAddTask}
              title={addTaskLabel}
              type="button"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      {collapsed ? null : (
        <ListTaskRows
          {...rowProps}
          contentId={contentId}
          groupId={group.id}
          tasks={tasks}
        />
      )}
    </KanbanColumn>
  );
}

export function ListPropertyLabels({
  properties,
}: {
  properties: PropertyDefinition[];
}) {
  return properties.map((property) => (
    <span
      className="truncate px-2 py-1.5 text-[11px] font-medium text-muted-foreground"
      key={property.id}
      title={property.name}
    >
      {property.name}
    </span>
  ));
}

export function ListTaskRows({
  assignments,
  contentId,
  groupId,
  gridStyle,
  onPropertyChange,
  onSelectTask,
  people,
  properties,
  readOnly,
  reorderTaskLabel,
  tasks,
  untitledLabel,
}: ListTaskRowsProps) {
  return (
    <KanbanColumnContent
      className="gap-0 pb-1"
      id={contentId}
      render={<ul />}
      value={groupId}
    >
      {tasks.map((task) => {
        const assignment = assignments.get(task.id);
        const taskName = task.name || untitledLabel;
        return (
          <KanbanItem
            className="group/task-row data-[disabled=true]:opacity-100! data-[dragging=true]:z-20 data-[dragging=true]:opacity-40"
            disabled={readOnly}
            key={task.id}
            render={<li />}
            role="listitem"
            tabIndex={-1}
            value={task.id}
          >
            <div
              className="grid min-h-11 items-center rounded-lg border border-transparent transition-colors hover:border-border/60 hover:bg-muted/35 focus-within:border-ring/40 focus-within:bg-muted/35"
              style={gridStyle}
            >
              <div className="flex min-h-11 min-w-0 items-center">
                {readOnly ? (
                  <span aria-hidden="true" className="size-7 shrink-0" />
                ) : (
                  <KanbanItemHandle
                    aria-label={reorderTaskLabel(taskName)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50 sm:opacity-0 sm:group-hover/task-row:opacity-100 sm:group-focus-within/task-row:opacity-100 data-[dragging=true]:opacity-100"
                    render={<button type="button" />}
                  >
                    <HugeiconsIcon
                      icon={DragDropVerticalIcon}
                      size={14}
                      strokeWidth={2}
                    />
                  </KanbanItemHandle>
                )}
                <button
                  className="flex min-h-11 min-w-0 flex-1 items-center rounded-md py-2 pr-3 pl-1 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  onClick={() => onSelectTask(task.id)}
                  type="button"
                >
                  <span className="truncate">{taskName}</span>
                </button>
              </div>
              {properties.map((property) => (
                <div
                  aria-label={property.name}
                  className="flex min-h-11 min-w-0 items-center px-2 py-1.5"
                  key={property.id}
                  onClick={(event) => event.stopPropagation()}
                  role="group"
                >
                  <PropertyValueField
                    appearance="metadata"
                    className="min-w-0 max-w-full"
                    disabled={readOnly}
                    onValueChange={(value) =>
                      onPropertyChange(task.id, property.id, value)
                    }
                    people={people}
                    property={property}
                    value={getTaskPropertyValue(assignment, property)}
                  />
                </div>
              ))}
            </div>
          </KanbanItem>
        );
      })}
    </KanbanColumnContent>
  );
}

export function getListGridStyle(propertyWidths: number[]): CSSProperties {
  return {
    gridTemplateColumns: [
      "minmax(16rem, 1fr)",
      ...propertyWidths.map((width) => `${width}rem`),
    ].join(" "),
  };
}

export function getPropertyColumnWidth(
  property: PropertyDefinition
): number {
  switch (property.type) {
    case "multi-select":
    case "people":
    case "resource":
    case "text":
      return 14;
    case "checkbox":
      return 7;
    default:
      return 11;
  }
}
