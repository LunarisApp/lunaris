import { useCallback, useEffect, useRef, useState } from "react";
import type { Doc } from "yjs";
import { Map as YMap } from "yjs";

/**
 * Subscribe to a single key in a YMap, returns [value, setter].
 */
export function useYMapField(
  yMap: YMap<string>,
  key: string
): [string, (v: string) => void] {
  const [value, setValue] = useState(() => yMap.get(key) ?? "");

  useEffect(() => {
    const handler = () => setValue(yMap.get(key) ?? "");
    yMap.observe(handler);
    handler();
    return () => yMap.unobserve(handler);
  }, [yMap, key]);

  const set = useCallback((v: string) => yMap.set(key, v), [yMap, key]);

  return [value, set];
}

/**
 * Subscribe to a JSON-stringified value in a YMap with typed fallback.
 */
export function useYMapJson<T>(
  yMap: YMap<string>,
  key: string,
  fallback: T
): [T, (v: T) => void] {
  const fallbackRef = useRef(fallback);

  const parse = useCallback((): T => {
    const raw = yMap.get(key);
    if (!raw) return fallbackRef.current;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallbackRef.current;
    }
  }, [yMap, key]);

  const [value, setValue] = useState(parse);

  useEffect(() => {
    const handler = () => setValue(parse());
    yMap.observe(handler);
    handler();
    return () => yMap.unobserve(handler);
  }, [yMap, key, parse]);

  const set = useCallback(
    (v: T) => yMap.set(key, JSON.stringify(v)),
    [yMap, key]
  );

  return [value, set];
}

/**
 * Subscribe to a Y.Array of Y.Maps. Use `deep` for nested YMap mutation tracking.
 */
export function useYArray(
  yDoc: Doc,
  arrayName: string,
  options?: { deep?: boolean }
) {
  const deep = options?.deep ?? false;
  const yArray = yDoc.getArray<YMap<string>>(arrayName);
  const [, setRevision] = useState(0);

  useEffect(() => {
    const handler = () => setRevision((r) => r + 1);
    if (deep) {
      yArray.observeDeep(handler);
      return () => yArray.unobserveDeep(handler);
    }
    yArray.observe(handler);
    return () => yArray.unobserve(handler);
  }, [yArray, deep]);

  const items = yArray.toArray();

  const add = useCallback(
    (initial: Record<string, string>) => {
      yDoc.transact(() => {
        const newMap = new YMap<string>();
        yArray.push([newMap]);
        for (const [k, v] of Object.entries(initial)) {
          newMap.set(k, v);
        }
      });
    },
    [yDoc, yArray]
  );

  const remove = useCallback(
    (index: number) => yArray.delete(index, 1),
    [yArray]
  );

  return { items, add, remove };
}
