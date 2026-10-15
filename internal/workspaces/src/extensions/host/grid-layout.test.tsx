/** @vitest-environment happy-dom */

import type { ResourceResolution } from "@lunarisapp/plugin-sdk";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { isResourceViewReady } from "./resource-view-readiness";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerResourceViewWithGridLayout } from "./grid-layout";

const { dbMock, resolveHostResourceMock, storageSlotsState } = vi.hoisted(() => ({
  dbMock: {},
  resolveHostResourceMock: vi.fn(),
  storageSlotsState: {
    data: [] as Array<Record<string, unknown>>,
    isLoading: false,
  },
}));

vi.mock("./resource-presence", () => ({ ResourcePresenceBoundary: ({ children }: { children: React.ReactNode }) => children }));

vi.mock("@repo/data/core", () => ({
  usePowerSync: () => dbMock,
}));

vi.mock("@repo/data/features/workspace-storage-slots", () => ({
  useResourceStorageSlots: () => storageSlotsState,
}));

vi.mock("@repo/data/features/yjs", () => ({
  useReadyYjsDocument: () => ({
    error: null,
    isLoading: false,
    yDoc: null,
  }),
}));

vi.mock("@repo/workspaces/workspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "workspace-1" }),
}));

vi.mock("./resource-resolution", () => ({
  resolveHostResource: resolveHostResourceMock,
}));

describe("registerResourceViewWithGridLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageSlotsState.data = [];
    storageSlotsState.isLoading = false;
    resolveHostResourceMock.mockImplementation(async ({ envelope }) => ({
      envelope,
      status: "ready",
    }));
  });

  it("isolates hooks used by resource renderers and layout wrappers", async () => {
    let RegisteredRenderer:
      | ((props: { params: Record<string, unknown> }) => React.ReactNode)
      | undefined;
    const resourceType = {
      resourceTypeId: "lunaris.rich-text",
      schema: { currentVersion: 1, id: "lunaris.rich-text" },
      storage: {},
    };

    registerResourceViewWithGridLayout(
      (_extensionId, _viewId, builder) => {
        RegisteredRenderer = builder;
      },
      "lunaris.rich-text",
      {
        icon: {},
        name: "Rich text",
        renderer: ({ reportReady }) => {
          useLayoutEffect(() => reportReady?.(), [reportReady]);
          const [label] = useState("Resource body");
          return <div>{label}</div>;
        },
        storageRequirements: {},
        target: {
          kind: "resource",
          resourceTypeId: "lunaris.rich-text",
        },
        viewId: "lunaris.rich-text",
      },
      () => resourceType,
      {
        layoutWrapper: ({ children }) => {
          const [label] = useState("Resource layout");
          return (
            <section>
              <h1>{label}</h1>
              {children}
            </section>
          );
        },
      }
    );

    expect(RegisteredRenderer).toBeDefined();
    const Renderer = RegisteredRenderer as NonNullable<
      typeof RegisteredRenderer
    >;

    const { unmount, rerender } = render(
      <Renderer
        params={{
          resourceId: "resource-1",
          resourceTypeId: "lunaris.rich-text",
          schemaVersion: 1,
        }}
      />
    );

    expect(await screen.findByText("Resource body")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Resource layout" })).toBeDefined();
    expect(isResourceViewReady("resource-1")).toBe(true);
    rerender(
      <Renderer
        params={{
          resourceId: "resource-2",
          resourceTypeId: "lunaris.rich-text",
          schemaVersion: 1,
        }}
      />
    );
    expect(isResourceViewReady("resource-1")).toBe(false);
    await waitFor(() => expect(isResourceViewReady("resource-2")).toBe(true));
    unmount();
    expect(isResourceViewReady("resource-2")).toBe(false);
  });

  it("never renders a stale resource after envelope params change", async () => {
    const resolvers: Array<(value: ResourceResolution) => void> = [];
    resolveHostResourceMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    let RegisteredRenderer:
      | ((props: { params: Record<string, unknown> }) => React.ReactNode)
      | undefined;
    const resourceType = {
      resourceTypeId: "lunaris.rich-text",
      schema: { currentVersion: 1, id: "lunaris.rich-text" },
      storage: {},
    };

    registerResourceViewWithGridLayout(
      (_extensionId, _viewId, builder) => {
        RegisteredRenderer = builder;
      },
      "lunaris.rich-text",
      {
        icon: {},
        name: "Rich text",
        renderer: ({ resource }) => <div>{resource.parentId}</div>,
        storageRequirements: {},
        target: {
          kind: "resource",
          resourceTypeId: "lunaris.rich-text",
        },
        viewId: "lunaris.rich-text",
      },
      () => resourceType,
    );

    const Renderer = RegisteredRenderer as NonNullable<
      typeof RegisteredRenderer
    >;
    const view = render(
      <Renderer
        params={{
          parentId: "parent-a",
          resourceId: "resource-1",
          resourceTypeId: "lunaris.rich-text",
          schemaVersion: 1,
        }}
      />,
    );
    view.rerender(
      <Renderer
        params={{
          parentId: "parent-b",
          resourceId: "resource-1",
          resourceTypeId: "lunaris.rich-text",
          schemaVersion: 1,
        }}
      />,
    );

    expect(screen.getByRole("status", { name: "Loading resource" })).toBeTruthy();
    expect(screen.queryByText("parent-a")).toBeNull();

    await act(async () => {
      resolvers[1]?.({
        envelope: {
          parentId: "parent-b",
          resourceId: "resource-1",
          resourceTypeId: "lunaris.rich-text",
          schemaVersion: 1,
        },
        status: "ready",
      });
    });
    expect(screen.getByText("parent-b")).toBeTruthy();

    await act(async () => {
      resolvers[0]?.({
        envelope: {
          parentId: "parent-a",
          resourceId: "resource-1",
          resourceTypeId: "lunaris.rich-text",
          schemaVersion: 1,
        },
        status: "ready",
      });
    });
    expect(screen.getByText("parent-b")).toBeTruthy();
    expect(screen.queryByText("parent-a")).toBeNull();
  });

  it("keeps the resource mounted when volatile slot fields sync", async () => {
    storageSlotsState.data = [
      {
        backing_id: "document-1",
        id: "storage-1",
        kind: "yjs",
        metadata: null,
        name: "content",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    let RegisteredRenderer:
      | ((props: { params: Record<string, unknown> }) => React.ReactNode)
      | undefined;
    const resourceType = {
      resourceTypeId: "lunaris.rich-text",
      schema: { currentVersion: 1, id: "lunaris.rich-text" },
      storage: { content: { kind: "yjs" as const } },
    };

    registerResourceViewWithGridLayout(
      (_extensionId, _viewId, builder) => {
        RegisteredRenderer = builder;
      },
      "lunaris.rich-text",
      {
        icon: {},
        name: "Rich text",
        renderer: () => <div>Resource body</div>,
        storageRequirements: { content: "yjs" },
        target: {
          kind: "resource",
          resourceTypeId: "lunaris.rich-text",
        },
        viewId: "lunaris.rich-text",
      },
      () => resourceType,
    );

    const Renderer = RegisteredRenderer as NonNullable<
      typeof RegisteredRenderer
    >;
    const params = {
      resourceId: "resource-1",
      resourceTypeId: "lunaris.rich-text",
      schemaVersion: 1,
    };
    const view = render(<Renderer params={params} />);
    expect(await screen.findByText("Resource body")).toBeTruthy();

    storageSlotsState.data = [
      {
        ...storageSlotsState.data[0],
        metadata: JSON.stringify({ size: 42 }),
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ];
    view.rerender(<Renderer params={params} />);

    expect(screen.getByText("Resource body")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading resource" })).toBeNull();
    expect(resolveHostResourceMock).toHaveBeenCalledTimes(1);
  });
});
