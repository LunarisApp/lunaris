"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { ItemInstance } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  ArrowDown01Icon,
  HugeiconsIcon,
  MinusSignIcon,
  PlusSignIcon,
} from "@lunarisapp/ui/icons";
import {
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  useContext,
} from "react";
import { cn } from "../lib/utils";

type ToggleIconType = "chevron" | "plus-minus";

interface TreeContextValue<T = any> {
  currentItem?: ItemInstance<T>;
  indent: number;
  toggleIconType?: ToggleIconType;
  tree?: any;
}

const TreeContext = createContext<TreeContextValue>({
  indent: 20,
  currentItem: undefined,
  tree: undefined,
  toggleIconType: "plus-minus",
});

function useTreeContext<T = any>() {
  return useContext(TreeContext) as TreeContextValue<T>;
}

interface TreeProps extends HTMLAttributes<HTMLDivElement> {
  indent?: number;
  toggleIconType?: ToggleIconType;
  tree?: any;
}

function Tree({
  indent = 20,
  tree,
  className,
  toggleIconType = "chevron",
  ...props
}: TreeProps) {
  const containerProps =
    tree && typeof tree.getContainerProps === "function"
      ? tree.getContainerProps()
      : {};
  const mergedProps = { ...props, ...containerProps };

  // Extract style from mergedProps to merge with our custom styles
  const { style: propStyle, ...otherProps } = mergedProps;

  // Merge styles
  const mergedStyle = {
    ...propStyle,
    "--tree-indent": `${indent}px`,
  } as CSSProperties;

  return (
    <TreeContext.Provider value={{ indent, tree, toggleIconType }}>
      <div
        className={cn("flex flex-col", className)}
        data-slot="tree"
        style={mergedStyle}
        {...otherProps}
      />
    </TreeContext.Provider>
  );
}

interface TreeItemProps<T = any>
  extends Omit<useRender.ComponentProps<"button">, "indent"> {
  indent?: number;
  item: ItemInstance<T>;
}

function TreeItem<T = any>({
  item,
  className,
  render,
  children,
  ...props
}: TreeItemProps<T>) {
  const parentContext = useTreeContext<T>();
  const { indent } = parentContext;

  const itemProps = typeof item.getProps === "function" ? item.getProps() : {};
  const mergedProps = mergeProps<"button">({ ...props, children }, itemProps);

  // Extract style from mergedProps to merge with our custom styles
  const { style: propStyle, ...otherProps } = mergedProps;

  // Merge styles
  const mergedStyle = {
    ...propStyle,
    "--tree-padding": `${item.getItemMeta().level * indent}px`,
  } as CSSProperties;

  const defaultProps = {
    "data-slot": "tree-item",
    style: mergedStyle,
    className: cn(
      "z-10 select-none ps-(--tree-padding) not-last:pb-0.5 outline-hidden focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    "data-focus":
      typeof item.isFocused === "function" ? item.isFocused() : undefined,
    "data-folder":
      typeof item.isFolder === "function" ? item.isFolder() : undefined,
    "data-selected":
      typeof item.isSelected === "function" ? item.isSelected() : undefined,
    "data-drag-target":
      typeof item.isDragTarget === "function" ? item.isDragTarget() : undefined,
    "data-search-match":
      typeof item.isMatchingSearch === "function"
        ? item.isMatchingSearch()
        : undefined,
    "aria-expanded": item.isExpanded(),
  };

  return (
    <TreeContext.Provider value={{ ...parentContext, currentItem: item }}>
      {useRender({
        defaultTagName: "button",
        render,
        props: mergeProps<"button">(defaultProps, otherProps),
      })}
    </TreeContext.Provider>
  );
}

interface TreeItemLabelProps<T = any> extends HTMLAttributes<HTMLSpanElement> {
  item?: ItemInstance<T>;
}

function TreeItemLabel<T = any>({
  item: propItem,
  children,
  className,
  ...props
}: TreeItemLabelProps<T>) {
  const { currentItem, toggleIconType } = useTreeContext<T>();
  const item = propItem || currentItem;

  if (!item) {
    console.warn("TreeItemLabel: No item provided via props or context");
    return null;
  }

  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-sm bg-background in-data-[drag-target=true]:bg-accent in-data-[search-match=true]:bg-blue-400/20! in-data-[selected=true]:bg-accent px-2 py-1.5 not-in-data-[folder=true]:ps-7 in-data-[selected=true]:text-accent-foreground text-sm in-focus-visible:ring-[3px] in-focus-visible:ring-ring/50 transition-colors hover:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="tree-item-label"
      {...props}
    >
      {item.isFolder() &&
        (toggleIconType === "plus-minus" ? (
          item.isExpanded() ? (
            <HugeiconsIcon
              className="size-3.5 text-muted-foreground"
              icon={MinusSignIcon}
              strokeWidth={1}
            />
          ) : (
            <HugeiconsIcon
              className="size-3.5 text-muted-foreground"
              icon={PlusSignIcon}
              strokeWidth={1}
            />
          )
        ) : (
          <HugeiconsIcon
            className="size-4 in-aria-[expanded=false]:-rotate-90 text-muted-foreground"
            icon={ArrowDown01Icon}
          />
        ))}
      {children ||
        (typeof item.getItemName === "function" ? item.getItemName() : null)}
    </span>
  );
}

function TreeDragLine({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { tree } = useTreeContext();

  if (!tree || typeof tree.getDragLineStyle !== "function") {
    console.warn(
      "TreeDragLine: No tree provided via context or tree does not have getDragLineStyle method"
    );
    return null;
  }

  const dragLine = tree.getDragLineStyle();
  return (
    <div
      className={cn(
        "absolute z-30 -mt-px h-0.5 w-[unset] bg-primary before:absolute before:-top-[3px] before:left-0 before:size-2 before:rounded-full before:border-2 before:border-primary before:bg-background",
        className
      )}
      style={dragLine}
      {...props}
    />
  );
}

export * from "@headless-tree/core";
export * from "@headless-tree/react";
export { Tree, TreeDragLine, TreeItem, TreeItemLabel, useTree };
