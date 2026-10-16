import {
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FOCUS_MODE_WIDTH_MIN,
  useGridLayoutStore,
} from "../grid-layout/context";

interface FocusModeWidthHandleProps {
  outerRef: RefObject<HTMLDivElement | null>;
  side: "left" | "right";
}

/**
 * Vertical drag handle on the edge of the focus-mode content area.
 * Dragging either handle resizes the content symmetrically around the center
 * (delta applied 2x to width so the opposite edge also moves).
 */
export function FocusModeWidthHandle({
  side,
  outerRef,
}: FocusModeWidthHandleProps) {
  const width = useGridLayoutStore((s) => s.focusModeWidth);
  const setWidth = useGridLayoutStore((s) => s.setFocusModeWidth);
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
    maxWidth: number;
  } | null>(null);

  const [containerWidth, setContainerWidth] = useState(width);
  useEffect(() => {
    const container = outerRef.current;
    if (!container) {
      return;
    }
    const update = () =>
      setContainerWidth(container.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [outerRef]);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const container = outerRef.current;
      if (!container) {
        return;
      }
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startWidth: width,
        maxWidth: container.getBoundingClientRect().width,
      };
    },
    [width, outerRef]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const delta = e.clientX - drag.startX;
      const factor = side === "right" ? 1 : -1;
      const raw = drag.startWidth + 2 * delta * factor;
      const clamped = Math.max(
        FOCUS_MODE_WIDTH_MIN,
        Math.min(raw, drag.maxWidth)
      );
      setWidth(clamped);
    },
    [side, setWidth]
  );

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <div
      aria-label="Resize content width"
      aria-orientation="vertical"
      aria-valuemin={FOCUS_MODE_WIDTH_MIN}
      aria-valuemax={Math.max(containerWidth, width, FOCUS_MODE_WIDTH_MIN)}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.key !== "ArrowLeft" &&
          event.key !== "ArrowRight" &&
          event.key !== "Home" &&
          event.key !== "End"
        ) {
          return;
        }
        const maxWidth = outerRef.current?.getBoundingClientRect().width;
        if (!maxWidth) {
          return;
        }
        event.preventDefault();
        const direction =
          (event.key === "ArrowRight" ? 1 : -1) * (side === "right" ? 1 : -1);
        const next =
          event.key === "Home"
            ? FOCUS_MODE_WIDTH_MIN
            : event.key === "End"
              ? maxWidth
              : width + direction * (event.shiftKey ? 100 : 20);
        setWidth(Math.max(FOCUS_MODE_WIDTH_MIN, Math.min(next, maxWidth)));
      }}
      className={`group absolute inset-y-0 z-10 w-4 cursor-ew-resize touch-none select-none focus-visible:outline-2 focus-visible:outline-ring ${
        side === "left" ? "-left-2" : "-right-2"
      }`}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="separator"
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-border opacity-30 transition-opacity duration-150 group-hover:opacity-100" />
    </div>
  );
}
