"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MeasuringStrategy,
  type Modifiers,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type AnimateLayoutChanges,
  arrayMove,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@lunarisapp/ui/lib/utils";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface KanbanContextProps<T> {
  activeId: UniqueIdentifier | null;
  columnIds: string[];
  columns: Record<string, T[]>;
  findContainer: (id: UniqueIdentifier) => string | undefined;
  getItemId: (item: T) => string;
  isColumn: (id: UniqueIdentifier) => boolean;
  modifiers?: Modifiers;
  setActiveId: (id: UniqueIdentifier | null) => void;
  setColumns: (columns: Record<string, T[]>) => void;
}

const KanbanContext = createContext<KanbanContextProps<any>>({
  columns: {},
  setColumns: () => {},
  getItemId: () => "",
  columnIds: [],
  activeId: null,
  setActiveId: () => {},
  findContainer: () => undefined,
  isColumn: () => false,
  modifiers: undefined,
});

const ColumnContext = createContext<{
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners | undefined;
  isDragging?: boolean;
  disabled?: boolean;
}>({
  attributes: {} as DraggableAttributes,
  listeners: undefined,
  isDragging: false,
  disabled: false,
});

const ItemContext = createContext<{
  listeners: DraggableSyntheticListeners | undefined;
  isDragging?: boolean;
  disabled?: boolean;
}>({
  listeners: undefined,
  isDragging: false,
  disabled: false,
});

const IsOverlayContext = createContext(false);

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.4",
      },
    },
  }),
};

export interface KanbanMoveEvent {
  activeContainer: string;
  activeIndex: number;
  event: DragEndEvent;
  overContainer: string;
  overIndex: number;
}

export interface KanbanCommitMeta<T> {
  activeContainer: string;
  activeIndex: number;
  event: DragEndEvent;
  kind: "item" | "column";
  overContainer: string;
  overIndex: number;
  previousValue: Record<string, T[]>;
}

export interface KanbanRootProps<T>
  extends Omit<
    useRender.ComponentProps<"div">,
    "children" | "onDragEnd" | "onDragStart"
  > {
  accessibility?: ComponentProps<typeof DndContext>["accessibility"];
  children: ReactNode;
  getItemValue: (item: T) => string;
  modifiers?: Modifiers;
  onDragCancel?: (event: DragCancelEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onMove?: (event: KanbanMoveEvent) => void;
  onValueChange: (value: Record<string, T[]>) => void;
  onValueCommit?: (
    value: Record<string, T[]>,
    meta: KanbanCommitMeta<T>
  ) => void;
  restoreOnCancel?: boolean;
  value: Record<string, T[]>;
}

function Kanban<T>({
  value,
  onValueChange,
  getItemValue,
  children,
  className,
  render,
  onMove,
  onValueCommit,
  restoreOnCancel = false,
  onDragStart,
  onDragEnd,
  onDragCancel,
  accessibility,
  modifiers,
  ...props
}: KanbanRootProps<T>) {
  const columns = value;
  const setColumns = onValueChange;
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const valueRef = useRef(value);
  const getItemValueRef = useRef(getItemValue);
  const dragOriginRef = useRef<{
    container: string | undefined;
    index: number;
    value: Record<string, T[]>;
  } | null>(null);

  useLayoutEffect(() => {
    valueRef.current = value;
    getItemValueRef.current = getItemValue;
  });

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const columnIds = useMemo(() => Object.keys(columns), [columns]);

  const isColumn = useCallback(
    (id: UniqueIdentifier) => columnIds.includes(id as string),
    [columnIds]
  );

  const findContainer = useCallback(
    (id: UniqueIdentifier) => {
      if (isColumn(id)) {
        return id as string;
      }
      return columnIds.find((key) =>
        columns[key]?.some((item) => getItemValue(item) === id)
      );
    },
    [columns, columnIds, getItemValue, isColumn]
  );

  const commitChange = useCallback(
    (
      finalValue: Record<string, T[]>,
      event: DragEndEvent,
      kind: "item" | "column"
    ) => {
      const origin = dragOriginRef.current;
      if (!(onValueCommit && origin)) {
        return;
      }

      const id = event.active.id;
      if (kind === "column") {
        const keys = Object.keys(finalValue);
        const overIndex = keys.indexOf(id as string);
        if (overIndex === -1 || overIndex === origin.index) {
          return;
        }

        onValueCommit(finalValue, {
          activeContainer: id as string,
          activeIndex: origin.index,
          event,
          kind,
          overContainer: String(event.over?.id ?? id),
          overIndex,
          previousValue: origin.value,
        });
        return;
      }

      const getId = getItemValueRef.current;
      let overContainer: string | undefined;
      let overIndex = -1;
      for (const key of Object.keys(finalValue)) {
        const found = finalValue[key]?.findIndex((item) => getId(item) === id);
        if (found !== undefined && found !== -1) {
          overContainer = key;
          overIndex = found;
          break;
        }
      }
      if (overContainer === undefined) {
        return;
      }
      if (overContainer === origin.container && overIndex === origin.index) {
        return;
      }

      onValueCommit(finalValue, {
        activeContainer: origin.container ?? overContainer,
        activeIndex: origin.index,
        event,
        kind,
        overContainer,
        overIndex,
        previousValue: origin.value,
      });
    },
    [onValueCommit]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id);
      onDragStart?.(event);

      if (!(onValueCommit || restoreOnCancel)) {
        return;
      }

      const snapshot = valueRef.current;
      const id = event.active.id;
      const keys = Object.keys(snapshot);
      if (keys.includes(id as string)) {
        dragOriginRef.current = {
          container: id as string,
          index: keys.indexOf(id as string),
          value: snapshot,
        };
        return;
      }

      const getId = getItemValueRef.current;
      let container: string | undefined;
      let index = -1;
      for (const key of keys) {
        const found = snapshot[key]?.findIndex((item) => getId(item) === id);
        if (found !== undefined && found !== -1) {
          container = key;
          index = found;
          break;
        }
      }
      dragOriginRef.current = { container, index, value: snapshot };
    },
    [onDragStart, onValueCommit, restoreOnCancel]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (onMove) {
        return;
      }

      const { active, over } = event;
      if (!over) {
        return;
      }

      if (isColumn(active.id)) {
        return;
      }

      const activeContainer = findContainer(active.id);
      const overContainer = findContainer(over.id);

      if (!(activeContainer && overContainer)) {
        return;
      }

      if (activeContainer === overContainer) {
        const container = activeContainer;
        const activeIndex = columns[container]!.findIndex(
          (item: T) => getItemValue(item) === active.id
        );
        const overIndex = isColumn(over.id)
          ? columns[container]!.length - 1
          : columns[container]!.findIndex(
              (item: T) => getItemValue(item) === over.id
            );

        if (activeIndex !== overIndex) {
          setColumns({
            ...columns,
            [container]: arrayMove(columns[container]!, activeIndex, overIndex),
          });
        }
      } else {
        const activeItems = columns[activeContainer]!;
        const overItems = columns[overContainer]!;

        const activeIndex = activeItems.findIndex(
          (item: T) => getItemValue(item) === active.id
        );
        let overIndex = overItems.findIndex(
          (item: T) => getItemValue(item) === over.id
        );

        // If dropping on the column itself, not an item
        if (isColumn(over.id)) {
          overIndex = overItems.length;
        }

        const newActiveItems = [...activeItems];
        const newOverItems = [...overItems];
        const [movedItem] = newActiveItems.splice(activeIndex, 1);
        newOverItems.splice(overIndex, 0, movedItem!);

        setColumns({
          ...columns,
          [activeContainer]: newActiveItems,
          [overContainer]: newOverItems,
        });
      }
    },
    [findContainer, getItemValue, isColumn, setColumns, columns, onMove]
  );

  const handleDragCancel = useCallback(
    (event: DragCancelEvent) => {
      const origin = dragOriginRef.current;
      if (restoreOnCancel && origin && !onMove) {
        setColumns(origin.value);
      }

      dragOriginRef.current = null;
      setActiveId(null);
      onDragCancel?.(event);
    },
    [onDragCancel, onMove, restoreOnCancel, setColumns]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      onDragEnd?.(event);

      if (!over) {
        const origin = dragOriginRef.current;
        if (restoreOnCancel && origin && !onMove) {
          setColumns(origin.value);
        } else {
          commitChange(valueRef.current, event, "item");
        }
        dragOriginRef.current = null;
        return;
      }

      // Handle item move callback
      if (onMove && !isColumn(active.id)) {
        const activeContainer = findContainer(active.id);
        const overContainer = findContainer(over.id);

        if (activeContainer && overContainer) {
          const activeIndex = columns[activeContainer]!.findIndex(
            (item: T) => getItemValue(item) === active.id
          );
          const overIndex = isColumn(over.id)
            ? columns[overContainer]!.length
            : columns[overContainer]!.findIndex(
                (item: T) => getItemValue(item) === over.id
              );

          onMove({
            event,
            activeContainer,
            activeIndex,
            overContainer,
            overIndex,
          });
        }
        dragOriginRef.current = null;
        return;
      }

      // Handle column reordering
      if (isColumn(active.id) && isColumn(over.id)) {
        const activeIndex = columnIds.indexOf(active.id as string);
        const overIndex = columnIds.indexOf(over.id as string);
        if (activeIndex !== overIndex) {
          const newOrder = arrayMove(
            Object.keys(columns),
            activeIndex,
            overIndex
          );
          const newColumns: Record<string, T[]> = {};
          newOrder.forEach((key) => {
            newColumns[key] = columns[key]!;
          });
          setColumns(newColumns);
          commitChange(newColumns, event, "column");
        }
        dragOriginRef.current = null;
        return;
      }

      if (isColumn(active.id)) {
        dragOriginRef.current = null;
        return;
      }

      const activeContainer = findContainer(active.id);
      const overContainer = findContainer(over.id);

      // Handle item reordering within the same column
      if (
        activeContainer &&
        overContainer &&
        activeContainer === overContainer
      ) {
        const container = activeContainer;
        const activeIndex = columns[container]!.findIndex(
          (item: T) => getItemValue(item) === active.id
        );
        const overIndex = isColumn(over.id)
          ? columns[container]!.length - 1
          : columns[container]!.findIndex(
              (item: T) => getItemValue(item) === over.id
            );

        if (activeIndex === overIndex) {
          commitChange(columns, event, "item");
        } else {
          const newColumns = {
            ...columns,
            [container]: arrayMove(columns[container]!, activeIndex, overIndex),
          };
          setColumns(newColumns);
          commitChange(newColumns, event, "item");
        }
      } else {
        commitChange(columns, event, "item");
      }
      dragOriginRef.current = null;
    },
    [
      columnIds,
      columns,
      commitChange,
      findContainer,
      getItemValue,
      isColumn,
      onDragEnd,
      restoreOnCancel,
      setColumns,
      onMove,
    ]
  );

  const contextValue = useMemo(
    () => ({
      columns,
      setColumns,
      getItemId: getItemValue,
      columnIds,
      activeId,
      setActiveId,
      findContainer,
      isColumn,
      modifiers,
    }),
    [
      columns,
      setColumns,
      getItemValue,
      columnIds,
      activeId,
      findContainer,
      isColumn,
      modifiers,
    ]
  );

  const defaultProps = {
    "data-slot": "kanban",
    "data-dragging": activeId !== null,
    className: cn(activeId !== null && "cursor-grabbing!", className),
    children,
  };

  return (
    <KanbanContext.Provider value={contextValue}>
      <DndContext
        accessibility={accessibility}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
        modifiers={modifiers}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        {useRender({
          defaultTagName: "div",
          render,
          props: mergeProps<"div">(defaultProps, props),
        })}
      </DndContext>
    </KanbanContext.Provider>
  );
}

export type KanbanBoardProps = useRender.ComponentProps<"div">;

function KanbanBoard({ className, render, ...props }: KanbanBoardProps) {
  const { columnIds } = useContext(KanbanContext);

  const defaultProps = {
    "data-slot": "kanban-board",
    className: cn("grid auto-rows-fr gap-4 sm:grid-cols-3", className),
    children: props.children,
  };

  return (
    <SortableContext items={columnIds} strategy={rectSortingStrategy}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </SortableContext>
  );
}

export interface KanbanColumnProps extends useRender.ComponentProps<"div"> {
  disabled?: boolean;
  value: string;
}

function KanbanColumn({
  value,
  className,
  render,
  disabled,
  ...props
}: KanbanColumnProps) {
  const isOverlay = useContext(IsOverlayContext);

  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging: isSortableDragging,
  } = useSortable({
    id: value,
    disabled: isOverlay || disabled,
    animateLayoutChanges,
  });

  const { activeId, isColumn } = useContext(KanbanContext);
  const isColumnDragging = activeId ? isColumn(activeId) : false;

  if (isOverlay) {
    const defaultProps = {
      "data-slot": "kanban-column",
      "data-value": value,
      "data-dragging": true,
      className: cn("group/kanban-column flex flex-col", className),
      children: props.children,
    };

    return (
      <ColumnContext.Provider
        value={{
          attributes: {} as DraggableAttributes,
          listeners: undefined,
          isDragging: true,
          disabled: false,
        }}
      >
        {useRender({
          defaultTagName: "div",
          render,
          props: mergeProps<"div">(defaultProps, props),
        })}
      </ColumnContext.Provider>
    );
  }

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  } as CSSProperties;

  const defaultProps = {
    "data-slot": "kanban-column",
    "data-value": value,
    "data-dragging": isSortableDragging,
    "data-disabled": disabled,
    ref: setNodeRef,
    style,
    className: cn(
      "group/kanban-column flex flex-col",
      isSortableDragging && "z-50 opacity-50",
      disabled && "opacity-50",
      className
    ),
    children: props.children,
  };

  return (
    <ColumnContext.Provider
      value={{ attributes, listeners, isDragging: isColumnDragging, disabled }}
    >
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </ColumnContext.Provider>
  );
}

export interface KanbanColumnHandleProps
  extends useRender.ComponentProps<"div"> {
  cursor?: boolean;
}

function KanbanColumnHandle({
  className,
  render,
  cursor = true,
  ...props
}: KanbanColumnHandleProps) {
  const { attributes, listeners, isDragging, disabled } =
    useContext(ColumnContext);

  const defaultProps = {
    "data-slot": "kanban-column-handle",
    "data-dragging": isDragging,
    "data-disabled": disabled,
    ...attributes,
    ...listeners,
    className: cn(
      "touch-manipulation opacity-0 transition-opacity group-hover/kanban-column:opacity-100",
      cursor && (isDragging ? "cursor-grabbing!" : "cursor-grab!"),
      className
    ),
    children: props.children,
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export interface KanbanItemProps extends useRender.ComponentProps<"div"> {
  disabled?: boolean;
  value: string;
}

function KanbanItem({
  value,
  className,
  render,
  disabled,
  ...props
}: KanbanItemProps) {
  const isOverlay = useContext(IsOverlayContext);

  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging: isSortableDragging,
  } = useSortable({
    id: value,
    disabled: isOverlay || disabled,
    animateLayoutChanges,
  });

  const { activeId, isColumn } = useContext(KanbanContext);
  const isItemDragging = activeId ? !isColumn(activeId) : false;

  if (isOverlay) {
    const defaultProps = {
      "data-slot": "kanban-item",
      "data-value": value,
      "data-dragging": true,
      className: cn(className),
      children: props.children,
    };

    return (
      <ItemContext.Provider
        value={{ listeners: undefined, isDragging: true, disabled: false }}
      >
        {useRender({
          defaultTagName: "div",
          render,
          props: mergeProps<"div">(defaultProps, props),
        })}
      </ItemContext.Provider>
    );
  }

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  } as CSSProperties;

  const defaultProps = {
    "data-slot": "kanban-item",
    "data-value": value,
    "data-dragging": isSortableDragging,
    "data-disabled": disabled,
    ref: setNodeRef,
    style,
    ...attributes,
    className: cn(
      isSortableDragging && "z-50 opacity-50",
      disabled && "opacity-50",
      className
    ),
    children: props.children,
  };

  return (
    <ItemContext.Provider
      value={{ listeners, isDragging: isItemDragging, disabled }}
    >
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </ItemContext.Provider>
  );
}

export interface KanbanItemHandleProps extends useRender.ComponentProps<"div"> {
  cursor?: boolean;
}

function KanbanItemHandle({
  className,
  render,
  cursor = true,
  ...props
}: KanbanItemHandleProps) {
  const { listeners, isDragging, disabled } = useContext(ItemContext);

  const defaultProps = {
    "data-slot": "kanban-item-handle",
    "data-dragging": isDragging,
    "data-disabled": disabled,
    ...listeners,
    className: cn(
      "touch-manipulation",
      cursor && (isDragging ? "cursor-grabbing!" : "cursor-grab!"),
      className
    ),
    children: props.children,
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export interface KanbanColumnContentProps
  extends useRender.ComponentProps<"div"> {
  value: string;
}

function KanbanColumnContent({
  value,
  className,
  render,
  ...props
}: KanbanColumnContentProps) {
  const { columns, getItemId } = useContext(KanbanContext);

  const itemIds = useMemo(
    () => (columns[value] ?? []).map(getItemId),
    [columns, getItemId, value]
  );

  const defaultProps = {
    "data-slot": "kanban-column-content",
    className: cn("flex flex-col gap-2", className),
    children: props.children,
  };

  return (
    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </SortableContext>
  );
}

export interface KanbanOverlayProps
  extends Omit<ComponentProps<typeof DragOverlay>, "children"> {
  children?:
    | ReactNode
    | ((params: {
        value: UniqueIdentifier;
        variant: "column" | "item";
      }) => ReactNode);
}

function KanbanOverlay({ children, className, ...props }: KanbanOverlayProps) {
  const { activeId, isColumn, modifiers } = useContext(KanbanContext);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => setMounted(true), []);

  const variant = activeId ? (isColumn(activeId) ? "column" : "item") : "item";

  const content =
    activeId && children
      ? typeof children === "function"
        ? children({ value: activeId, variant })
        : children
      : null;

  if (!mounted) {
    return null;
  }

  return createPortal(
    <DragOverlay
      className={cn("z-50", activeId && "cursor-grabbing", className)}
      dropAnimation={dropAnimationConfig}
      modifiers={modifiers}
      {...props}
    >
      <IsOverlayContext.Provider value={true}>
        {content}
      </IsOverlayContext.Provider>
    </DragOverlay>,
    document.body
  );
}

export {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanColumnHandle,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
};
