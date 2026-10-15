import { definePlugin, definePluginService } from "@lunarisapp/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { PluginRegistry } from "./registry";

function plugin(
  id: string,
  optionalDependencies: Record<string, string> = {},
  version = "1.0.0",
) {
  return definePlugin({
    activate: () => undefined,
    manifest: {
      api: "^0.9.0",
      conflicts: {},
      dependencies: {},
      description: id,
      developer: "Acme",
      id,
      name: id,
      optionalDependencies,
      permissions: [],
      version,
    },
  });
}

describe("PluginRegistry", () => {
  it("keeps folders out of generic create menus", () => {
    const folder = new PluginRegistry().getResourceType("lunaris.folder");

    expect(folder?.definition.hierarchy?.userCreatable).toBe(false);
    expect(folder?.definition.hierarchy?.visible).toBe(true);
  });

  it("rebinds optional slots when their provider returns", async () => {
    const registry = new PluginRegistry();
    const service = definePluginService({
      id: "acme.exporter.documents",
      methods: ["echo"],
      version: "1.0.0",
    });
    const slot = service.slot<{ label: string }, string, string>("representations");
    const provider = plugin("acme.exporter");
    const consumer = plugin("acme.rich-text", { "acme.exporter": "^1.0.0" });
    registry.registerPlugin(consumer);
    registry.registerSlotContribution(consumer.manifest.id, {
      contribution: {
        id: "acme.rich-text.exporter",
        invoke: (input) => input.toUpperCase(),
        metadata: { label: "Rich Text" },
      },
      slot,
    });

    expect(registry.getSlotContributions(consumer.manifest.id, slot)).toEqual([]);
    const removeProvider = registry.registerPlugin(provider);
    const removeService = registry.registerService(provider.manifest.id, {
      definition: service,
      implementation: { echo: (input) => input },
    });
    const [contribution] = registry.getSlotContributions(consumer.manifest.id, slot);
    await expect(contribution?.invoke("note")).resolves.toBe("NOTE");

    removeService();
    removeProvider();
    expect(registry.getSlotContributions(consumer.manifest.id, slot)).toEqual([]);

    registry.registerPlugin(provider);
    registry.registerService(provider.manifest.id, {
      definition: service,
      implementation: { echo: (input) => input },
    });
    expect(registry.getSlotContributions(consumer.manifest.id, slot)).toHaveLength(1);
  });

  it("denies undeclared access and isolates slot invocation failures", async () => {
    const registry = new PluginRegistry();
    const service = definePluginService({ id: "acme.exporter", methods: [], version: "1.0.0" });
    const slot = service.slot<{ order: number }, string, string>("representations");
    const provider = plugin("acme.exporter");
    const declared = plugin("acme.declared", { "acme.exporter": "^1.0.0" });
    const undeclared = plugin("acme.undeclared");
    registry.registerPlugin(provider);
    registry.registerPlugin(declared);
    registry.registerPlugin(undeclared);
    registry.registerService(provider.manifest.id, { definition: service, implementation: {} });

    expect(registry.getService(undeclared.manifest.id, service)).toBeUndefined();
    expect(() => registry.registerSlotContribution(undeclared.manifest.id, {
      contribution: { id: "acme.undeclared.exporter", invoke: (input) => input, metadata: { order: 1 } },
      slot,
    })).toThrow("cannot contribute");

    const fail = vi.fn(() => { throw new Error("handler failed"); });
    registry.registerSlotContribution(declared.manifest.id, {
      contribution: { id: "acme.declared.z", invoke: fail, metadata: { order: 2 } },
      slot,
    });
    registry.registerSlotContribution(declared.manifest.id, {
      contribution: { id: "acme.declared.a", invoke: (input) => input, metadata: { order: 1 } },
      slot,
    });
    const contributions = registry.getSlotContributions(declared.manifest.id, slot);
    expect(contributions.map(({ id }) => id)).toEqual(["acme.declared.a", "acme.declared.z"]);
    await expect(contributions[1]?.invoke("value")).rejects.toThrow("handler failed");
    await expect(contributions[0]?.invoke("value")).resolves.toBe("value");
  });

  it("lets providers consume services in their namespace", () => {
    const registry = new PluginRegistry();
    const provider = plugin("acme.provider");
    const service = definePluginService({
      id: "acme.provider.documents",
      methods: [],
      version: "1.0.0",
    });
    registry.registerPlugin(provider);
    registry.registerService(provider.manifest.id, {
      definition: service,
      implementation: {},
    });

    expect(registry.getService(provider.manifest.id, service)).toBeDefined();
  });

  it("keeps older compatible consumers and slot contributions attached", () => {
    const registry = new PluginRegistry();
    const provider = plugin("acme.exporter", {}, "1.1.0");
    const consumer = plugin("acme.consumer", {
      "acme.exporter": "^1.0.0",
    });
    const serviceV1 = definePluginService({
      id: "acme.exporter",
      methods: [],
      version: "1.0.0",
    });
    const serviceV1_1 = definePluginService({
      id: "acme.exporter",
      methods: [],
      version: "1.1.0",
    });
    registry.registerPlugin(provider);
    registry.registerPlugin(consumer);
    registry.registerService(provider.manifest.id, {
      definition: serviceV1_1,
      implementation: {},
    });
    registry.registerSlotContribution(consumer.manifest.id, {
      contribution: {
        id: "acme.consumer.exporter",
        invoke: (input) => input,
        metadata: {},
      },
      slot: serviceV1.slot("documents"),
    });

    expect(registry.getService(consumer.manifest.id, serviceV1)).toBeDefined();
    expect(
      registry.getSlotContributions(
        provider.manifest.id,
        serviceV1_1.slot("documents"),
      ),
    ).toHaveLength(1);
  });

  it("hides and rejects mismatched service-slot contracts", async () => {
    const registry = new PluginRegistry();
    const provider = plugin("acme.exporter");
    const consumer = plugin("acme.consumer", {
      "acme.exporter": ">=1.0.0 <3.0.0",
    });
    const serviceV1 = definePluginService({
      id: "acme.exporter",
      methods: [],
      version: "1.0.0",
    });
    const serviceV2 = definePluginService({
      id: "acme.exporter",
      methods: [],
      version: "2.0.0",
    });
    const contributionId = "acme.consumer.exporter";
    registry.registerPlugin(provider);
    registry.registerPlugin(consumer);
    registry.registerService(provider.manifest.id, {
      definition: serviceV1,
      implementation: {},
    });
    registry.registerSlotContribution(consumer.manifest.id, {
      contribution: {
        id: contributionId,
        invoke: (input) => input,
        metadata: {},
      },
      slot: serviceV2.slot("documents"),
    });

    expect(
      registry.getSlotContributions(
        consumer.manifest.id,
        serviceV1.slot("documents"),
      ),
    ).toEqual([]);
    expect(registry.getService(consumer.manifest.id, serviceV2)).toBeUndefined();
    await expect(
      registry.invokeSlot(
        consumer.manifest.id,
        `acme.exporter:documents:acme.consumer:${contributionId}`,
        "value",
      ),
    ).rejects.toThrow("unavailable");
  });

  it("rejects non-wire slot results", async () => {
    const registry = new PluginRegistry();
    const service = definePluginService({
      id: "acme.exporter",
      methods: [],
      version: "1.0.0",
    });
    const provider = plugin("acme.exporter");
    const consumer = plugin("acme.consumer", {
      "acme.exporter": "^1.0.0",
    });
    registry.registerPlugin(provider);
    registry.registerPlugin(consumer);
    registry.registerService(provider.manifest.id, {
      definition: service,
      implementation: {},
    });
    registry.registerSlotContribution(consumer.manifest.id, {
      contribution: {
        id: "acme.consumer.exporter",
        invoke: () => new Date() as never,
        metadata: {},
      },
      slot: service.slot("documents"),
    });

    const [contribution] = registry.getSlotContributions(
      consumer.manifest.id,
      service.slot("documents"),
    );
    await expect(contribution?.invoke("value")).rejects.toThrow(
      "structured-clone-safe",
    );
  });
});
