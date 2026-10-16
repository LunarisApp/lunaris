"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "@lunarisapp/ui/lib/utils";
import type { Ref } from "react";
import { composeRefs } from "../lib/compose-refs";

type ScrollAreaProps = ScrollAreaPrimitive.Root.Props & {
  orientation?: "both" | "horizontal" | "vertical";
  scrollbarGutter?: boolean;
  scrollFade?: boolean;
  viewportClassName?: string;
  viewportProps?: ScrollAreaPrimitive.Viewport.Props;
  viewportRef?: Ref<HTMLDivElement>;
};

function ScrollArea({
  className,
  children,
  orientation = "vertical",
  scrollbarGutter,
  scrollFade,
  viewportClassName,
  viewportProps,
  viewportRef,
  ...rootProps
}: ScrollAreaProps) {
  const {
    className: viewportPropsClassName,
    ref: viewportPropsRef,
    ...restViewportProps
  } = viewportProps ?? {};

  return (
    <ScrollAreaPrimitive.Root
      className={cn("relative", className)}
      data-scroll-fade={scrollFade || undefined}
      data-scrollbar-gutter={scrollbarGutter || undefined}
      data-slot="scroll-area"
      {...rootProps}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn(
          "size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          viewportClassName,
          viewportPropsClassName
        )}
        data-slot="scroll-area-viewport"
        ref={composeRefs(viewportRef, viewportPropsRef)}
        {...restViewportProps}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation === "vertical" || orientation === "both" ? (
        <ScrollBar orientation="vertical" />
      ) : null}
      {orientation === "horizontal" || orientation === "both" ? (
        <ScrollBar orientation="horizontal" />
      ) : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        "flex touch-none select-none p-px transition-colors data-horizontal:h-2.5 data-vertical:h-full data-vertical:w-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      data-orientation={orientation}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className="relative flex-1 rounded-full bg-border"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
