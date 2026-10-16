import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import {
  definePlugin,
  defineWorkspaceStorage,
  defineResourceType,
  defineView,
  preparePluginActivation,
} from "./definition";
import type { ResourceTypeDefinition, ViewDefinition } from "./types";
import { definePluginService } from "./services";

const icon: ResourceTypeDefinition["icon"] = [];
const manifest = (id = "acme.notes") => ({
  api: "^0.9.0",
  conflicts: {},
  dependencies: {},
  description: "Notes",
  developer: "Acme",
  id,
  name: "Notes",
  permissions: [],
  version: "1.0.0",
});
const resource = (id = "acme.notes"): ResourceTypeDefinition => ({
  icon,
  name: "Notes",
  resourceTypeId: id,
  schema: {
    currentVersion: 1,
    id: `${id}.schema`,
    read: () => ({}),
    versions: { 1: z.object({}) },
  },
  storage: {},
});

describe("plugin activation", () => {
  it("stages registrations before starting effects", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const plugin = definePlugin({
      manifest: manifest(),
      activate({ contributions, effects }) {
        contributions.resourceType(resource());
        effects.add(() => {
          start();
          return stop;
        });
      },
    });
    const prepared = await preparePluginActivation(plugin);
    expect(prepared.contributions).toHaveLength(1);
    expect(start).not.toHaveBeenCalled();
    await prepared.start();
    await prepared.dispose();
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("rejects duplicate and foreign registrations", async () => {
    const duplicate = definePlugin({
      manifest: manifest(),
      activate({ contributions }) {
        contributions.resourceType(resource());
        contributions.resourceType(resource());
      },
    });
    await expect(preparePluginActivation(duplicate)).rejects.toThrow(
      "Duplicate"
    );

    const foreign = definePlugin({
      manifest: manifest(),
      activate({ contributions }) {
        contributions.resourceType(resource("other.notes"));
      },
    });
    await expect(preparePluginActivation(foreign)).rejects.toThrow("namespace");
  });

  it("validates schema graphs and resource view targets", async () => {
    expect(() => resource("acme.notes")).not.toThrow();
    const plugin = definePlugin({
      manifest: manifest(),
      activate({ contributions }) {
        contributions.resourceType({
          ...resource(),
          defaultViewId: "acme.notes.view",
        });
        contributions.view({
          icon,
          viewId: "acme.notes.view",
          name: "Editor",
          renderer: () => null,
          storageRequirements: {},
          target: { kind: "resource", resourceTypeIds: ["acme.notes"] },
        });
      },
    });
    await expect(preparePluginActivation(plugin)).resolves.toBeDefined();
  });

  it("rejects invalid schema ranges", async () => {
    const plugin = definePlugin({
      manifest: manifest(),
      activate({ contributions }) {
        contributions.view({
          icon,
          viewId: "acme.notes.view",
          name: "Editor",
          renderer: () => null,
          storageRequirements: {},
          target: {
            kind: "resource",
            schemas: [
              { id: "acme.notes.schema", minimumVersion: 2, maximumVersion: 1 },
            ],
          },
        });
      },
    });
    await expect(preparePluginActivation(plugin)).rejects.toThrow(
      "version range"
    );
  });

  it("rejects invalid storage definitions at runtime", () => {
    expect(() =>
      defineResourceType({
        ...resource(),
        storage: { content: { kind: "database" } },
      } as unknown as ResourceTypeDefinition)
    ).toThrow("invalid storage kind");

    expect(() =>
      defineView({
        icon,
        name: "Editor",
        renderer: () => null,
        storageRequirements: { content: "database" },
        target: { kind: "resource", resourceTypeIds: ["acme.notes"] },
        viewId: "acme.notes.view",
      } as unknown as ViewDefinition)
    ).toThrow("invalid storage kind");

    expect(() =>
      defineWorkspaceStorage({
        kind: "yjs",
        storageId: "acme.notes.preferences",
      } as never)
    ).toThrow("must use key-value");
    expect(() =>
      defineWorkspaceStorage({
        kind: "key-value",
        storageId: "Invalid namespace",
      })
    ).toThrow("invalid storage ID");
  });

  it("registers search indexers and query providers", async () => {
    const plugin = definePlugin({
      manifest: manifest(),
      activate({ contributions }) {
        contributions.searchIndexer({
          extractText: ({ payload }) => String(payload),
          id: "acme.notes.search",
          resourceTypeIds: ["acme.notes"],
        });
        contributions.searchQuery({
          id: "acme.notes.remote-search",
          open: () => undefined,
          query: async () => ({ items: [], nextCursor: null }),
        });
      },
    });

    const activation = await preparePluginActivation(plugin);
    expect(activation.contributions.map(({ type }) => type)).toEqual([
      "search-indexer",
      "search-query",
    ]);
  });

  it("registers namespaced services and declared multibind slots", async () => {
    const exporter = definePluginService({
      id: "acme.exporter.documents",
      methods: ["render"],
      version: "1.0.0",
    });
    const representations = exporter.slot<{ label: string }, string, string>(
      "representations"
    );
    const provider = definePlugin({
      manifest: manifest("acme.exporter"),
      activate({ services }) {
        services.provide(exporter, { render: (input) => input });
      },
    });
    const consumer = definePlugin({
      manifest: {
        ...manifest("acme.notes"),
        optionalDependencies: { "acme.exporter": "^1.0.0" },
      },
      activate({ services, slots }) {
        services.optional(exporter);
        slots.contribute(representations, {
          id: "acme.notes.exporter",
          invoke: (input) => input.toUpperCase(),
          metadata: { label: "Notes" },
        });
      },
    });

    const providerActivation = await preparePluginActivation(provider);
    const consumerActivation = await preparePluginActivation(consumer);
    expect(providerActivation.serviceProviders).toHaveLength(1);
    expect(consumerActivation.slotContributions).toHaveLength(1);
  });

  it("rejects non-wire slot metadata", async () => {
    const exporter = definePluginService({
      id: "acme.exporter",
      methods: [],
      version: "1.0.0",
    });
    const consumer = definePlugin({
      manifest: {
        ...manifest("acme.notes"),
        optionalDependencies: { "acme.exporter": "^1.0.0" },
      },
      activate({ slots }) {
        slots.contribute(exporter.slot("documents"), {
          id: "acme.notes.exporter",
          invoke: (input) => input,
          metadata: { createdAt: new Date() },
        });
      },
    });

    await expect(preparePluginActivation(consumer)).rejects.toThrow(
      "structured-clone-safe"
    );
  });

  it("rejects invalid service versions", () => {
    expect(() =>
      definePluginService({
        id: "acme.exporter",
        methods: [],
        version: "next",
      })
    ).toThrow("invalid version");
  });

  it("rejects foreign providers and undeclared service access", async () => {
    const foreign = definePluginService({
      id: "other.service",
      methods: [],
      version: "1.0.0",
    });
    const provide = definePlugin({
      manifest: manifest(),
      activate({ services }) {
        services.provide(foreign, {});
      },
    });
    const consume = definePlugin({
      manifest: manifest(),
      activate({ services }) {
        services.optional(foreign);
      },
    });

    await expect(preparePluginActivation(provide)).rejects.toThrow("namespace");
    await expect(preparePluginActivation(consume)).rejects.toThrow(
      "has not declared optional dependency"
    );
  });

  it("validates search indexer targets and functions", async () => {
    const missingTarget = definePlugin({
      manifest: manifest(),
      activate({ contributions }) {
        contributions.searchIndexer({
          extractText: () => null,
          id: "acme.notes.search",
        });
      },
    });
    await expect(preparePluginActivation(missingTarget)).rejects.toThrow(
      "must target"
    );
  });

  it("rejects status-bar content on standalone views at runtime", () => {
    expect(() =>
      defineView({
        icon,
        name: "Tool",
        renderer: () => null,
        statusBar: () => null,
        target: { kind: "standalone" },
        viewId: "acme.notes.tool",
      } as unknown as ViewDefinition)
    ).toThrow("cannot define status-bar content");
  });

  it("seals registration after activation", async () => {
    let register: (() => void) | undefined;
    const plugin = definePlugin({
      manifest: manifest(),
      activate({ contributions }) {
        register = () => contributions.resourceType(resource());
      },
    });
    await preparePluginActivation(plugin);
    expect(register).toBeDefined();
    expect(() => register?.()).toThrow("already complete");
  });
});
