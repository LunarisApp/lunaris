import type { PluginStoredFileMetadata } from "@lunarisapp/plugin-sdk";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { formatFileSize } from "./format-file-size";

interface ImageRendererProps {
  metadata: PluginStoredFileMetadata;
  objectUrl: string;
}

interface ImageDimensions {
  height: number;
  width: number;
}

interface DragState {
  direction: ResizeDirection;
  pointerX: number;
  pointerY: number;
  size: ImageDimensions;
}

type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const HANDLE_CONFIG: Array<{
  className: string;
  cursor: string;
  direction: ResizeDirection;
}> = [
  { className: "-top-2 -left-2 size-4", cursor: "cursor-nwse-resize", direction: "nw" },
  { className: "-top-2 left-1/2 h-4 w-10 -translate-x-1/2", cursor: "cursor-ns-resize", direction: "n" },
  { className: "-top-2 -right-2 size-4", cursor: "cursor-nesw-resize", direction: "ne" },
  { className: "top-1/2 -right-2 h-10 w-4 -translate-y-1/2", cursor: "cursor-ew-resize", direction: "e" },
  { className: "-right-2 -bottom-2 size-4", cursor: "cursor-nwse-resize", direction: "se" },
  { className: "-bottom-2 left-1/2 h-4 w-10 -translate-x-1/2", cursor: "cursor-ns-resize", direction: "s" },
  { className: "-bottom-2 -left-2 size-4", cursor: "cursor-nesw-resize", direction: "sw" },
  { className: "top-1/2 -left-2 h-10 w-4 -translate-y-1/2", cursor: "cursor-ew-resize", direction: "w" },
];

export function ImageRenderer({ metadata, objectUrl }: ImageRendererProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [displaySize, setDisplaySize] = useState<ImageDimensions | null>(null);

  useEffect(() => {
    setDimensions(null);
    setDisplaySize(null);
    dragRef.current = null;
  }, [objectUrl]);

  useEffect(() => {
    if (!dimensions || typeof ResizeObserver === "undefined") return;
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => {
      setDisplaySize((size) => {
        if (!size) return initialDisplaySize(dimensions, panel);
        return clampToPanel(size.width, dimensions, panel);
      });
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [dimensions]);

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: ResizeDirection
  ) => {
    if (!displaySize || !dimensions) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      direction,
      pointerX: event.clientX,
      pointerY: event.clientY,
      size: displaySize,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      const panel = panelRef.current;
      if (!drag || !panel) return;
      const nextWidth = widthFromDrag({
        deltaX: moveEvent.clientX - drag.pointerX,
        deltaY: moveEvent.clientY - drag.pointerY,
        dimensions,
        direction: drag.direction,
        size: drag.size,
      });
      setDisplaySize(clampToPanel(nextWidth, dimensions, panel));
    };

    const endDrag = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  return (
    <div
      className="relative flex h-full items-center justify-center overflow-hidden bg-background p-4"
      data-testid="image-panel"
      ref={panelRef}
    >
      <div
        className="group relative flex max-h-full max-w-full select-none items-center justify-center border border-border/70 bg-muted/20"
        data-testid="image-resize-frame"
        style={{
          height: displaySize ? `${displaySize.height}px` : undefined,
          width: displaySize ? `${displaySize.width}px` : undefined,
        }}
      >
        <img
          alt={metadata.filename}
          className="h-full w-full object-contain"
          draggable={false}
          onLoad={(event) => {
            const nextDimensions = {
              height: event.currentTarget.naturalHeight,
              width: event.currentTarget.naturalWidth,
            };
            setDimensions(nextDimensions);
            const panel = panelRef.current;
            if (panel) setDisplaySize(initialDisplaySize(nextDimensions, panel));
          }}
          src={objectUrl}
        />
        {HANDLE_CONFIG.map((handle) => (
          <button
            aria-label={`Resize image ${handle.direction}`}
            className={`absolute z-10 touch-none rounded-sm bg-primary/20 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${handle.cursor} ${handle.className}`}
            data-resize-direction={handle.direction}
            key={handle.direction}
            onPointerDown={(event) => handlePointerDown(event, handle.direction)}
            type="button"
          />
        ))}
      </div>
      <div
        className="pointer-events-none absolute right-3 bottom-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 overflow-hidden text-muted-foreground text-xs leading-4"
        data-testid="image-metadata"
      >
        <span className="truncate font-medium">{metadata.filename}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className="shrink-0">{metadata.mediaType}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className="shrink-0">{formatFileSize(metadata.size)}</span>
        {dimensions ? (
          <>
            <span className="text-muted-foreground/60">·</span>
            <span className="shrink-0">{dimensions.width} x {dimensions.height}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function initialDisplaySize(
  dimensions: ImageDimensions,
  panel: HTMLElement
): ImageDimensions {
  return clampToPanel(dimensions.width, dimensions, panel);
}

function widthFromDrag(params: {
  deltaX: number;
  deltaY: number;
  dimensions: ImageDimensions;
  direction: ResizeDirection;
  size: ImageDimensions;
}) {
  const { deltaX, deltaY, dimensions, direction, size } = params;
  const aspectRatio = dimensions.width / dimensions.height;
  const horizontalDelta = direction.includes("e")
    ? deltaX
    : direction.includes("w")
      ? -deltaX
      : 0;
  const verticalDelta = direction.includes("s")
    ? deltaY
    : direction.includes("n")
      ? -deltaY
      : 0;
  const widthFromHorizontal = size.width + horizontalDelta;
  const widthFromVertical = (size.height + verticalDelta) * aspectRatio;

  if (horizontalDelta && verticalDelta) {
    const horizontalChange = Math.abs(widthFromHorizontal - size.width);
    const verticalChange = Math.abs(widthFromVertical - size.width);
    return horizontalChange >= verticalChange ? widthFromHorizontal : widthFromVertical;
  }
  return horizontalDelta ? widthFromHorizontal : widthFromVertical;
}

function clampToPanel(
  width: number,
  dimensions: ImageDimensions,
  panel: HTMLElement
): ImageDimensions {
  const panelWidth = panel.clientWidth || 960;
  const panelHeight = panel.clientHeight || 720;
  const aspectRatio = dimensions.width / dimensions.height;
  const minWidth = aspectRatio >= 1 ? 120 * aspectRatio : 120;
  const maxWidth = Math.max(minWidth, Math.min(panelWidth, panelHeight * aspectRatio));
  return sizeFromWidth(Math.min(Math.max(width, minWidth), maxWidth), dimensions);
}

function sizeFromWidth(width: number, dimensions: ImageDimensions): ImageDimensions {
  return {
    height: Math.round(width / (dimensions.width / dimensions.height)),
    width: Math.round(width),
  };
}
