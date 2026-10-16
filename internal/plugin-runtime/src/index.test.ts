import { definePlugin, type PluginManifest } from "@lunarisapp/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { PluginRuntime } from "./index";

const manifest = {
  api: "^0.9.0",
  conflicts: {},
  dependencies: {},
  optionalDependencies: {},
  description: "Plugin",
  developer: "Acme",
  id: "acme.plugin",
  name: "Plugin",
  permissions: [],
  version: "1.0.0",
} satisfies PluginManifest;

function plugin(
  overrides: Partial<PluginManifest> = {},
  activate: Parameters<typeof definePlugin>[0]["activate"] = () => undefined
) {
  return definePlugin({
    activate,
    manifest: { ...manifest, ...overrides },
  });
}

describe("PluginRuntime", () => {
  it("owns contribution and activation cleanup", async () => {
    const release = vi.fn();
    const stop = vi.fn();
    const runtime = new PluginRuntime({ commit: () => release });
    const definition = plugin({}, ({ effects }) => {
      effects.add(() => stop);
    });

    await runtime.activate(definition, undefined);
    expect(runtime.getState(definition.manifest.id)).toBe("active");
    await runtime.deactivate(definition.manifest.id);
    expect(release).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("rolls back activation when commit fails", async () => {
    const cleanup = vi.fn();
    const runtime = new PluginRuntime({
      commit: () => {
        throw new Error("commit failed");
      },
    });

    await expect(
      runtime.activate(
        plugin({}, () => cleanup),
        undefined
      )
    ).rejects.toThrow("commit failed");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.getState(manifest.id)).toBe("failed");
    expect(runtime.getDiagnostic(manifest.id)).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: "commit failed" }),
        pluginId: manifest.id,
        state: "failed",
      })
    );
  });

  it("rolls back commit when an effect fails", async () => {
    const release = vi.fn();
    const cleanup = vi.fn();
    const runtime = new PluginRuntime({ commit: () => release });
    const definition = plugin({}, ({ effects }) => {
      effects.add(() => {
        throw new Error("effect failed");
      });
      return cleanup;
    });

    await expect(runtime.activate(definition, undefined)).rejects.toThrow(
      "effect failed"
    );
    expect(release).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("serializes duplicate activation", async () => {
    const commit = vi.fn(() => () => undefined);
    const runtime = new PluginRuntime({ commit });
    const definition = plugin();

    await Promise.all([
      runtime.activate(definition, undefined),
      runtime.activate(definition, undefined),
    ]);

    expect(commit).toHaveBeenCalledOnce();
  });

  it("unloads dependents until their service returns", async () => {
    const dependentCleanup = vi.fn();
    const dependentActivate = vi.fn(() => dependentCleanup);
    const runtime = new PluginRuntime({ commit: () => () => undefined });
    const dependency = plugin({ id: "acme.dependency", name: "Dependency" });
    const dependent = plugin(
      {
        dependencies: { "acme.dependency": "^1.0.0" },
        id: "acme.dependent",
        name: "Dependent",
      },
      dependentActivate
    );
    await runtime.activate(dependency, undefined);
    await runtime.activate(dependent, undefined);

    await runtime.deactivate("acme.dependency");
    expect(runtime.getState("acme.dependent")).toBe("pending");
    expect(dependentCleanup).toHaveBeenCalledOnce();

    await runtime.activate(dependency, undefined);
    await runtime.awaitActivation("acme.dependent");
    expect(runtime.getState("acme.dependent")).toBe("active");
    expect(dependentActivate).toHaveBeenCalledTimes(2);
  });

  it("registers dependents before providers", async () => {
    const runtime = new PluginRuntime({ commit: () => () => undefined });
    const dependency = plugin({ id: "acme.dependency", name: "Dependency" });
    const dependent = plugin({
      dependencies: { "acme.dependency": "^1.0.0" },
      id: "acme.dependent",
      name: "Dependent",
    });

    await runtime.register(dependent, undefined);
    expect(runtime.getState("acme.dependent")).toBe("pending");
    expect(runtime.getDiagnostic("acme.dependent")?.dependencyIssues).toEqual([
      { pluginId: "acme.dependency", range: "^1.0.0", version: undefined },
    ]);

    await runtime.register(dependency, undefined);
    await runtime.awaitActivation("acme.dependent");
    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activationCount: 1,
          pluginId: "acme.dependent",
          state: "active",
        }),
      ])
    );
  });

  it("never blocks optional dependents", async () => {
    const activate = vi.fn(() => () => undefined);
    const runtime = new PluginRuntime({ commit: () => () => undefined });
    const dependent = plugin(
      {
        id: "acme.dependent",
        name: "Dependent",
        optionalDependencies: { "acme.dependency": "^2.0.0" },
      },
      activate
    );

    await runtime.register(dependent, undefined);
    await runtime.register(
      plugin({ id: "acme.dependency", name: "Dependency", version: "1.0.0" }),
      undefined
    );
    await runtime.deactivate("acme.dependency");

    expect(runtime.getState("acme.dependent")).toBe("active");
    expect(activate).toHaveBeenCalledOnce();
  });

  it("publishes Cordis Fiber diagnostics", async () => {
    const runtime = new PluginRuntime({ commit: () => () => undefined });
    const listener = vi.fn();
    const unsubscribe = runtime.subscribeDiagnostics(listener);
    const dependent = plugin({
      dependencies: { "acme.dependency": "^1.0.0" },
      id: "acme.dependent",
      name: "Dependent",
    });

    await runtime.register(dependent, undefined);

    expect(listener).toHaveBeenCalledWith([]);
    expect(listener).toHaveBeenLastCalledWith([
      expect.objectContaining({
        pluginId: "acme.dependent",
        state: "pending",
      }),
    ]);
    unsubscribe();
  });

  it("keeps dependents pending until a compatible service appears", async () => {
    const dependentActivate = vi.fn(() => () => undefined);
    const runtime = new PluginRuntime({ commit: () => () => undefined });
    const dependent = plugin(
      {
        dependencies: { "acme.dependency": "^2.0.0" },
        id: "acme.dependent",
        name: "Dependent",
      },
      dependentActivate
    );

    await runtime.register(dependent, undefined);
    await runtime.register(
      plugin({ id: "acme.dependency", name: "Dependency" }),
      undefined
    );
    await expect(runtime.awaitActivation("acme.dependent")).rejects.toThrow(
      "found 1.0.0"
    );
    expect(runtime.getState("acme.dependent")).toBe("pending");
    expect(runtime.getDiagnostic("acme.dependent")?.dependencyIssues).toEqual([
      {
        pluginId: "acme.dependency",
        range: "^2.0.0",
        version: "1.0.0",
      },
    ]);

    await runtime.replace(
      plugin({
        id: "acme.dependency",
        name: "Dependency",
        version: "2.0.0",
      }),
      undefined
    );
    await runtime.awaitActivation("acme.dependent");
    expect(runtime.getState("acme.dependent")).toBe("active");
    expect(dependentActivate).toHaveBeenCalledOnce();
  });

  it("suspends dependents across incompatible provider replacements", async () => {
    const dependentCleanup = vi.fn();
    const dependentActivate = vi.fn(() => dependentCleanup);
    const runtime = new PluginRuntime({ commit: () => () => undefined });
    const provider = (version: string) =>
      plugin({
        id: "acme.dependency",
        name: "Dependency",
        version,
      });
    const dependent = plugin(
      {
        dependencies: { "acme.dependency": "^1.0.0" },
        id: "acme.dependent",
        name: "Dependent",
      },
      dependentActivate
    );

    await runtime.activate(provider("1.0.0"), undefined);
    await runtime.activate(dependent, undefined);
    await runtime.replace(provider("2.0.0"), undefined);

    expect(runtime.getState("acme.dependent")).toBe("pending");
    expect(dependentCleanup).toHaveBeenCalledOnce();
    expect(runtime.getDiagnostic("acme.dependent")?.dependencyIssues).toEqual([
      {
        pluginId: "acme.dependency",
        range: "^1.0.0",
        version: "2.0.0",
      },
    ]);

    await runtime.replace(provider("1.1.0"), undefined);
    await runtime.awaitActivation("acme.dependent");

    expect(runtime.getState("acme.dependent")).toBe("active");
    expect(runtime.getDiagnostic("acme.dependent")?.activationCount).toBe(2);
    expect(dependentActivate).toHaveBeenCalledTimes(2);
  });

  it("surfaces cleanup failures after removing runtime state", async () => {
    const runtime = new PluginRuntime({
      commit: () => () => {
        throw new Error("cleanup failed");
      },
    });
    await runtime.activate(plugin(), undefined);

    await expect(runtime.deactivate(manifest.id)).rejects.toThrow(
      "cleanup failed"
    );
    expect(runtime.getState(manifest.id)).toBe("inactive");
    expect(runtime.get(manifest.id)).toBeUndefined();
  });

  it("preserves contribution and activation cleanup failures", async () => {
    const runtime = new PluginRuntime({
      commit: () => () => {
        throw new Error("contribution cleanup failed");
      },
    });
    await runtime.activate(
      plugin({}, () => () => {
        throw new Error("activation cleanup failed");
      }),
      undefined
    );

    const error = await runtime
      .deactivate(manifest.id)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "contribution cleanup failed" }),
      expect.objectContaining({ message: "activation cleanup failed" }),
    ]);
    expect(runtime.getState(manifest.id)).toBe("inactive");
  });
});
