import { useCallback, useEffect, useRef } from "react";

export type ObservePreloadRow = (
  element: Element,
  onVisibilityChange: (visible: boolean) => void
) => () => void;

/** One observer per scroll container, independent of tree focus and rendering. */
export function usePreloadViewport(
  root: HTMLDivElement | null
): ObservePreloadRow {
  const listeners = useRef(new Map<Element, (visible: boolean) => void>());
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") {
      return;
    }
    const instance = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          listeners.current.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { root, rootMargin: "200px 0px" }
    );
    observer.current = instance;
    for (const element of listeners.current.keys()) {
      instance.observe(element);
    }
    return () => {
      instance.disconnect();
      observer.current = null;
      for (const notify of listeners.current.values()) {
        notify(false);
      }
    };
  }, [root]);

  return useCallback((element, notify) => {
    listeners.current.set(element, notify);
    observer.current?.observe(element);
    return () => {
      observer.current?.unobserve(element);
      listeners.current.delete(element);
      notify(false);
    };
  }, []);
}
