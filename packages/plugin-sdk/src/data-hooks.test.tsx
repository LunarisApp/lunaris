/** @vitest-environment happy-dom */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PluginDataCapabilities } from "./data-adapter";
import { useKeyValue, useWorkspaceKeyValue } from "./data-hooks";
import { type PluginSdkRuntime, ExtensionSdkProvider } from "./provider";
import type { PluginHostCapabilities } from "./runtime-context";
import { ExtensionScopeProvider } from "./scope";
import type { ResourceStorageHandle } from "./types";

describe("declared extension storage", () => {
  it("routes resource handles and workspace descriptors through separate scopes", () => {
    const accesses: [string, string, string][] = [];
    const empty = <T,>() => ({
      isFetching: false,
      isLoading: false,
      remove: vi.fn(),
      set: vi.fn(),
      value: null as T | null,
    });
    const capabilities: PluginDataCapabilities = {
      useKeyValue: <T,>(storageId: string, key: string) => {
        accesses.push(["resource", storageId, key]);
        return empty<T>();
      },
      useWorkspaceKeyValue: <T,>(
        pluginId: string,
        storageId: string,
        key: string
      ) => {
        accesses.push([pluginId, storageId, key]);
        return empty<T>();
      },
      useReadyYjsStorage: vi.fn(),
    };
    const runtime: PluginSdkRuntime = {
      contributions: {
        getCommands: () => [],
        getWorkspaceStorage: vi.fn(),
        getWorkspaceStorages: () => [],
        getResourceType: vi.fn(),
        getResourceTypes: () => [],
        getSearchIndexers: () => [],
        getSearchQueries: () => [],
        getVersion: () => 0,
        getView: vi.fn(),
        getViews: () => [],
        subscribe: () => () => undefined,
      },
      data: capabilities,
      host: {} as PluginHostCapabilities,
      services: {} as never,
    };

    function Consumer({ suffix }: { suffix: string }) {
      useKeyValue(
        {
          kind: "key-value",
          storageId: `resource-${suffix}`,
        } as ResourceStorageHandle,
        "setting"
      );
      useWorkspaceKeyValue(
        { kind: "key-value", storageId: "preferences" },
        "theme"
      );
      return null;
    }

    render(
      <ExtensionSdkProvider runtime={runtime}>
        <ExtensionScopeProvider
          extensionId="acme.alpha"
          permissions={["content.read", "content.write"]}
        >
          <Consumer suffix="a" />
        </ExtensionScopeProvider>
        <ExtensionScopeProvider
          extensionId="acme.beta"
          permissions={["content.read", "content.write"]}
        >
          <Consumer suffix="b" />
        </ExtensionScopeProvider>
      </ExtensionSdkProvider>
    );

    expect(accesses).toEqual([
      ["resource", "resource-a", "setting"],
      ["acme.alpha", "preferences", "theme"],
      ["resource", "resource-b", "setting"],
      ["acme.beta", "preferences", "theme"],
    ]);
  });
});
