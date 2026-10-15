import {
  type ComponentType,
  type LazyExoticComponent,
  lazy,
  type ReactNode,
  useLayoutEffect,
} from "react";

export function ViewReady({
  children,
  reportReady,
}: {
  children?: ReactNode;
  reportReady?: () => void;
}) {
  useLayoutEffect(() => {
    reportReady?.();
  }, [reportReady]);
  return children ?? null;
}

// biome-ignore lint/suspicious/noExplicitAny: preserves each component's props
export interface PreloadableLazy<T extends ComponentType<any>> {
  Component: LazyExoticComponent<T>;
  preload: () => Promise<void>;
}

/** One module promise for intent prefetch and React.lazy, retryable on failure. */
// biome-ignore lint/suspicious/noExplicitAny: preserves each component's props
export function createPreloadableLazy<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): PreloadableLazy<T> {
  let loaded: { default: T } | undefined;
  let inFlight: Promise<{ default: T }> | undefined;

  const load = () => {
    if (loaded) return Promise.resolve(loaded);
    if (inFlight) return inFlight;
    inFlight = loader()
      .then((module) => {
        loaded = module;
        return module;
      })
      .catch((error: unknown) => {
        inFlight = undefined;
        throw error;
      });
    return inFlight;
  };

  return {
    Component: lazy(load),
    preload: () => load().then(() => undefined),
  };
}
