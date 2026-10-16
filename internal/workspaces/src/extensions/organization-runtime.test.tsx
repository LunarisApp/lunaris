// @vitest-environment happy-dom

import { act, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const { changeListener, extensionRegistryProviderMock, registryMock } =
  vi.hoisted(() => ({
    changeListener: { current: null as null | (() => void) },
    extensionRegistryProviderMock: vi.fn(),
    registryMock: vi.fn(),
  }));

vi.mock("./access", () => ({
  useAvailablePluginRegistry: () => registryMock(),
}));

vi.mock("@repo/workspaces/extensions", () => ({
  ExtensionRegistryProvider: (props: {
    children: ReactNode;
    extensionAvailability: Record<string, string>;
  }) => {
    extensionRegistryProviderMock(props);
    return props.children;
  },
  subscribeToWorkspaceExtensionChanges: (
    _workspaceId: string,
    listener: () => void
  ) => {
    changeListener.current = listener;
    return () => {
      changeListener.current = null;
    };
  },
}));

vi.mock("@repo/features/loading", () => ({
  LoaderView: () => <div>loading</div>,
}));

import {
  WorkspacePluginRuntimeProvider,
  useOrganizationPluginRuntime,
  OrganizationPluginRuntimeProvider,
} from "./organization-runtime";

function RuntimeReconciler({
  reconcile,
}: {
  reconcile: () => Promise<Record<string, Error | undefined>>;
}) {
  const runtime = useOrganizationPluginRuntime();
  useEffect(
    () => runtime.registerRuntimeReconciler(reconcile),
    [reconcile, runtime.registerRuntimeReconciler]
  );
  return null;
}

const readyRegistry = {
  allExtensionIds: ["lunaris.rich-text"],
  bundledExtensionIds: ["lunaris.rich-text"],
  defaultExtensionIds: ["lunaris.rich-text"],
  enabledExtensionIds: ["lunaris.rich-text"],
  extensionAvailability: { "lunaris.rich-text": "available" },
  extensionManifests: {},
  extensionMetadata: {},
  key: "lunaris.rich-text",
  loadPlugin: vi.fn(),
  loadPlugins: vi.fn(),
  pending: false,
  refreshWorkspaceExtensions: vi.fn(async () => undefined),
  runtimeRevisions: { "lunaris.rich-text": "bundled:1.0.0" },
  unloadPlugin: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  registryMock.mockReturnValue(readyRegistry);
});

it("keeps workspace children mounted during post-boot registry resolution", () => {
  const view = render(
    <WorkspacePluginRuntimeProvider workspaceId="workspace-1">
      <div>organization</div>
    </WorkspacePluginRuntimeProvider>
  );
  expect(screen.getByText("organization")).toBeTruthy();

  registryMock.mockReturnValue({ ...readyRegistry, pending: true });
  view.rerender(
    <WorkspacePluginRuntimeProvider workspaceId="workspace-1">
      <div>organization</div>
    </WorkspacePluginRuntimeProvider>
  );

  expect(screen.getByText("organization")).toBeTruthy();
  expect(screen.queryByText("loading")).toBeNull();
});

it("renders organization children during initial registry resolution", () => {
  registryMock.mockReturnValue({ ...readyRegistry, pending: true });

  render(
    <OrganizationPluginRuntimeProvider>
      <div>workspaces</div>
    </OrganizationPluginRuntimeProvider>
  );

  expect(screen.getByText("workspaces")).toBeTruthy();
  expect(screen.queryByText("loading")).toBeNull();
});

it("renders workspace children from the bundled baseline while resolving", () => {
  registryMock.mockReturnValue({ ...readyRegistry, pending: true });

  render(
    <WorkspacePluginRuntimeProvider workspaceId="workspace-1">
      <div>organization</div>
    </WorkspacePluginRuntimeProvider>
  );

  expect(screen.getByText("organization")).toBeTruthy();
  expect(screen.queryByText("loading")).toBeNull();
});

it("rereads workspace extension state after a window notification", () => {
  render(
    <WorkspacePluginRuntimeProvider workspaceId="workspace-1">
      <div>organization</div>
    </WorkspacePluginRuntimeProvider>
  );

  act(() => changeListener.current?.());

  expect(readyRegistry.refreshWorkspaceExtensions).toHaveBeenCalledOnce();
});

it("exposes runtime initialization failures to resource placeholders", async () => {
  const reconcile = vi.fn(async () => ({
    "lunaris.rich-text": new Error("activation failed"),
  }));

  render(
    <WorkspacePluginRuntimeProvider workspaceId="workspace-1">
      <RuntimeReconciler reconcile={reconcile} />
    </WorkspacePluginRuntimeProvider>
  );

  await waitFor(() => expect(reconcile).toHaveBeenCalled());
  await waitFor(() =>
    expect(extensionRegistryProviderMock.mock.lastCall?.[0]).toMatchObject({
      extensionAvailability: { "lunaris.rich-text": "load-failure" },
    })
  );
});

it("ignores failures from a superseded runtime reconciler", async () => {
  let resolveFirst: (errors: Record<string, Error | undefined>) => void = () =>
    undefined;
  let resolveSecond: (errors: Record<string, Error | undefined>) => void = () =>
    undefined;
  const first = vi.fn(
    () =>
      new Promise<Record<string, Error | undefined>>((resolve) => {
        resolveFirst = resolve;
      })
  );
  const second = vi.fn(
    () =>
      new Promise<Record<string, Error | undefined>>((resolve) => {
        resolveSecond = resolve;
      })
  );
  const view = render(
    <WorkspacePluginRuntimeProvider workspaceId="workspace-1">
      <RuntimeReconciler reconcile={first} />
    </WorkspacePluginRuntimeProvider>
  );
  await waitFor(() => expect(first).toHaveBeenCalled());

  view.rerender(
    <WorkspacePluginRuntimeProvider workspaceId="workspace-1">
      <RuntimeReconciler reconcile={second} />
    </WorkspacePluginRuntimeProvider>
  );
  await act(async () => {
    resolveFirst({ "lunaris.rich-text": new Error("stale failure") });
  });
  await waitFor(() => expect(second).toHaveBeenCalled());

  expect(extensionRegistryProviderMock.mock.lastCall?.[0]).toMatchObject({
    extensionAvailability: { "lunaris.rich-text": "available" },
  });

  await act(async () => resolveSecond({}));
});
