import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useYjsStorageIntentPreload } from "./use-preload-visible-resource";
import {
  type ObservePreloadRow,
  usePreloadViewport,
} from "./use-preload-viewport";

const { db, preload, renderer } = vi.hoisted(() => ({
  db: {},
  preload: vi.fn(),
  renderer: vi.fn(),
}));
vi.mock("@repo/data/core", () => ({ usePowerSync: () => db }));
vi.mock("@repo/data/features/yjs", () => ({ preloadYjsDocument: preload }));

let callback: IntersectionObserverCallback;
const observe = vi.fn();
const unobserve = vi.fn();
const disconnect = vi.fn();
const observerConstructor = vi.fn();

function Row({
  id,
  documentId = id,
  observer,
}: {
  id: string;
  documentId?: string;
  observer: ObservePreloadRow;
}) {
  const { ref, ...intent } = useYjsStorageIntentPreload(
    { storageId: id, documentId },
    "workspace-1",
    renderer,
    observer
  );
  return (
    <span {...intent} data-testid={id} ref={ref} tabIndex={0}>
      {id}
    </span>
  );
}

function Viewport({
  count = 1,
  documentId = "doc-0",
}: {
  count?: number;
  documentId?: string;
}) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const observer = usePreloadViewport(root);
  return (
    <div ref={setRoot}>
      {Array.from({ length: count }, (_, i) => (
        <Row
          documentId={i === 0 ? documentId : undefined}
          id={`row-${i}`}
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed placeholders or stateless rows; position is the intended identity.
          key={i}
          observer={observer}
        />
      ))}
    </div>
  );
}

function intersect(id: string, visible: boolean) {
  act(() =>
    callback(
      [
        {
          target: screen.getByTestId(id),
          isIntersecting: visible,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    )
  );
}

describe("viewport document preloading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderer.mockResolvedValue(undefined);
    preload.mockImplementation(() => ({
      done: Promise.resolve(),
      release: vi.fn(),
      promote: vi.fn(),
    }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect = disconnect;
        constructor(
          cb: IntersectionObserverCallback,
          options: IntersectionObserverInit
        ) {
          callback = cb;
          observerConstructor(options);
        }
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("observes 1,000 expanded rows once and preloads only intersecting rows", () => {
    const { container, unmount } = render(<Viewport count={1000} />);
    expect(observerConstructor).toHaveBeenCalledOnce();
    expect(observerConstructor).toHaveBeenCalledWith({
      root: container.firstChild,
      rootMargin: "200px 0px",
    });
    expect(observe).toHaveBeenCalledTimes(1000);
    expect(preload).not.toHaveBeenCalled();
    for (let i = 0; i < 8; i++) {
      intersect(`row-${i}`, true);
    }
    expect(preload).toHaveBeenCalledTimes(8);
    expect(preload.mock.calls[0]![0]).toMatchObject({
      documentId: "doc-0",
      priority: "background",
      workspaceId: "workspace-1",
    });
    const firstHandle = preload.mock.results[0]!.value;
    intersect("row-0", false);
    expect(firstHandle.release).toHaveBeenCalledOnce();
    unmount();
    for (const result of preload.mock.results) {
      expect(result.value.release).toHaveBeenCalledOnce();
    }
    expect(disconnect).toHaveBeenCalled();
  });

  it("reacquires on renewed intent instead of promoting an evicted handle", () => {
    render(<Viewport />);
    intersect("row-0", true);
    const firstHandle = preload.mock.results[0]!.value;
    fireEvent.pointerEnter(screen.getByTestId("row-0"));
    expect(preload).toHaveBeenLastCalledWith({
      db,
      documentId: "doc-0",
      priority: "intent",
      workspaceId: "workspace-1",
    });
    expect(firstHandle.release).toHaveBeenCalledOnce();
    expect(firstHandle.promote).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByTestId("row-0"));
    expect(preload).toHaveBeenCalledTimes(3);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("releases old backing when synced storage changes", () => {
    const { rerender } = render(<Viewport />);
    intersect("row-0", true);
    const firstHandle = preload.mock.results[0]!.value;
    rerender(<Viewport documentId="replacement" />);
    expect(firstHandle.release).toHaveBeenCalledOnce();
    intersect("row-0", true);
    expect(preload).toHaveBeenLastCalledWith(
      expect.objectContaining({ documentId: "replacement" })
    );
  });

  it("keeps keyboard intent available when IntersectionObserver is unsupported", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Viewport />);
    expect(preload).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByTestId("row-0"));
    expect(preload).toHaveBeenCalledOnce();
    expect(renderer).toHaveBeenCalledOnce();
  });
});
