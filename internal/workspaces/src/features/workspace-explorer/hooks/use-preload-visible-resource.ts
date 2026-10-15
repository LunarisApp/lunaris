import { usePowerSync } from "@repo/data/core";
import {
  preloadYjsDocument,
  type PreloadYjsDocumentHandle,
  type YjsPreloadPriority,
} from "@repo/data/features/yjs";
import { type PointerEventHandler, useCallback, useMemo, useRef } from "react";
import type { ObservePreloadRow } from "./use-preload-viewport";

export interface YjsPreloadTarget {
  documentId: string;
  storageId: string;
}

/** Warm only intersecting rows; explicit intent also works without an observer. */
export function useYjsStorageIntentPreload(
  storage: YjsPreloadTarget | undefined,
  workspaceId: string,
  preloadRenderer?: () => Promise<void>,
  observe?: ObservePreloadRow
) {
  const db = usePowerSync();
  const handle = useRef<PreloadYjsDocumentHandle | null>(null);
  const stopObserving = useRef<(() => void) | undefined>(undefined);
  const release = useCallback(() => {
    handle.current?.release();
    handle.current = null;
  }, []);
  const warm = useCallback(
    (priority: YjsPreloadPriority) => {
      if (!storage?.documentId || !workspaceId) return;
      // Acquire again instead of promoting a handle whose resource may have been evicted.
      const next = preloadYjsDocument({
        db,
        documentId: storage.documentId,
        priority,
        workspaceId,
      });
      release();
      handle.current = next;
    },
    [db, storage?.documentId, storage?.storageId, workspaceId, release]
  );

  const ref = useCallback(
    (element: HTMLSpanElement | null) => {
      stopObserving.current?.();
      stopObserving.current = undefined;
      release();
      if (element) {
        stopObserving.current = observe?.(element, (visible) => {
          if (visible) warm("background");
          else release();
        });
      }
    },
    [observe, warm, release]
  );

  const preload = useCallback(() => {
    warm("intent");
    void preloadRenderer?.().catch(() => undefined);
  }, [preloadRenderer, warm]);
  const preloadOnTouch = useCallback<PointerEventHandler>(
    (event) => {
      if (event.pointerType === "touch") preload();
    },
    [preload]
  );

  return useMemo(
    () => ({
      ref,
      onFocus: preload,
      onPointerDown: preloadOnTouch,
      onPointerEnter: preload,
    }),
    [preload, preloadOnTouch, ref]
  );
}
