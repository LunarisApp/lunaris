import type { PluginDefinition } from "@lunarisapp/plugin-sdk";
import { useCallback, useMemo, useRef } from "react";
import type { InitializePluginsDeps, PluginInitResult } from "./lifecycle";
import { usePluginHostLifecycle } from "./provider";

interface PluginLoadResult {
  error?: Error;
  plugin?: PluginDefinition;
}

interface PluginRuntimeHostOptions {
  i18n: InitializePluginsDeps["i18n"];
  loadPlugin(pluginId: string): Promise<PluginLoadResult>;
  registerRenderers: InitializePluginsDeps["gridLayoutRegister"];
  resourceViewLayoutWrapper: InitializePluginsDeps["resourceViewLayoutWrapper"];
  unloadPlugin?(pluginId: string, revision?: string): void;
  unregisterPlugin?(pluginId: string): void;
  unregisterRenderer: NonNullable<
    InitializePluginsDeps["gridLayoutUnregister"]
  >;
}

interface ActivePlugin {
  plugin: PluginDefinition;
  revision: string;
}

export interface PluginRuntimeReconcileTarget {
  enabledExtensionIds: readonly string[];
  extensionAvailability?: Record<string, string>;
  runtimeRevisions: Record<string, string>;
}

export function usePluginRuntimeHost({
  resourceViewLayoutWrapper,
  i18n,
  loadPlugin,
  registerRenderers,
  unloadPlugin,
  unregisterPlugin,
  unregisterRenderer,
}: PluginRuntimeHostOptions) {
  const { cleanupPlugins, disablePlugin, initializePlugins, reloadPlugin } =
    usePluginHostLifecycle();
  const pluginsRef = useRef(new Map<string, ActivePlugin>());
  const loadingRef = useRef(new Map<string, Promise<PluginDefinition>>());
  const epochRef = useRef(0);
  const loadPluginRef = useRef(loadPlugin);
  const unloadPluginRef = useRef(unloadPlugin);
  const unregisterPluginRef = useRef(unregisterPlugin);
  loadPluginRef.current = loadPlugin;
  unloadPluginRef.current = unloadPlugin;
  unregisterPluginRef.current = unregisterPlugin;
  const deps = useMemo<InitializePluginsDeps>(
    () => ({
      resourceViewLayoutWrapper,
      gridLayoutRegister: registerRenderers,
      gridLayoutUnregister: unregisterRenderer,
      i18n,
    }),
    [resourceViewLayoutWrapper, i18n, registerRenderers, unregisterRenderer]
  );

  const load = useCallback(
    (pluginId: string, revision = "current"): Promise<PluginDefinition> => {
      const key = `${pluginId}@${revision}`;
      const existing = loadingRef.current.get(key);
      if (existing) {
        return existing;
      }
      const request = loadPluginRef
        .current(pluginId)
        .then((result) => {
          if (result.plugin) {
            return result.plugin;
          }
          throw (
            result.error ?? new Error(`Failed to load extension "${pluginId}"`)
          );
        })
        .finally(() => {
          if (loadingRef.current.get(key) === request) {
            loadingRef.current.delete(key);
          }
        });
      loadingRef.current.set(key, request);
      return request;
    },
    []
  );

  const initialize = useCallback(
    async (pluginIds: readonly string[]): Promise<PluginInitResult[]> => {
      const epoch = epochRef.current;
      const loaded = await Promise.all(
        pluginIds.map(async (pluginId) => {
          try {
            return { plugin: await load(pluginId), pluginId };
          } catch (error) {
            return {
              error: error instanceof Error ? error : new Error(String(error)),
              pluginId,
            };
          }
        })
      );
      const plugins = loaded.flatMap(({ plugin }) => (plugin ? [plugin] : []));
      if (epoch !== epochRef.current) {
        for (const plugin of plugins) {
          unloadPluginRef.current?.(plugin.manifest.id);
        }
        return loaded.map(({ pluginId }) => ({
          error: new Error(`Extension "${pluginId}" load was cancelled`),
          pluginId,
          success: false,
        }));
      }
      const initialized = await initializePlugins(plugins, deps);
      if (epoch !== epochRef.current) {
        await cleanupPlugins(plugins).catch(() => undefined);
        for (const plugin of plugins) {
          unloadPluginRef.current?.(plugin.manifest.id);
        }
        return loaded.map(({ pluginId }) => ({
          error: new Error(`Extension "${pluginId}" load was cancelled`),
          pluginId,
          success: false,
        }));
      }
      const initializedById = new Map(
        initialized.map((result) => [result.pluginId, result])
      );
      const results = loaded.map(({ error, pluginId }) =>
        error
          ? { error, pluginId, success: false }
          : (initializedById.get(pluginId) ?? {
              error: new Error(`Extension "${pluginId}" was not initialized`),
              pluginId,
              success: false,
            })
      );
      pluginsRef.current = new Map(
        plugins
          .filter(
            (plugin) =>
              results.find(({ pluginId }) => pluginId === plugin.manifest.id)
                ?.success
          )
          .map((plugin) => [
            plugin.manifest.id,
            { plugin, revision: plugin.manifest.version },
          ])
      );
      for (const plugin of plugins) {
        if (!pluginsRef.current.has(plugin.manifest.id)) {
          unloadPluginRef.current?.(plugin.manifest.id);
        }
      }
      return results;
    },
    [cleanupPlugins, deps, initializePlugins, load]
  );

  const enable = useCallback(
    async (pluginId: string) => {
      const epoch = epochRef.current;
      const plugin = await load(pluginId);
      if (epoch !== epochRef.current) {
        unloadPluginRef.current?.(pluginId);
        throw new Error(`Extension "${pluginId}" load was cancelled`);
      }
      const [result] = await initializePlugins([plugin], deps);
      if (epoch !== epochRef.current) {
        await disablePlugin(pluginId).catch(() => undefined);
        unloadPluginRef.current?.(pluginId);
        throw new Error(`Extension "${pluginId}" load was cancelled`);
      }
      if (!result?.success) {
        unloadPluginRef.current?.(pluginId);
        throw (
          result?.error ??
          new Error(`Failed to initialize extension "${pluginId}"`)
        );
      }
      pluginsRef.current.set(pluginId, {
        plugin,
        revision: plugin.manifest.version,
      });
    },
    [deps, disablePlugin, initializePlugins, load]
  );

  const disable = useCallback(
    async (pluginId: string) => {
      const current = pluginsRef.current.get(pluginId);
      try {
        await disablePlugin(pluginId, unregisterPluginRef.current);
      } finally {
        pluginsRef.current.delete(pluginId);
        unloadPluginRef.current?.(pluginId, current?.revision);
      }
    },
    [disablePlugin]
  );

  const reconcile = useCallback(
    async (
      target: PluginRuntimeReconcileTarget
    ): Promise<Record<string, Error | undefined>> => {
      const epoch = epochRef.current;
      const desired = new Set(target.enabledExtensionIds);
      const errors: Record<string, Error | undefined> = {};

      for (const pluginId of [...pluginsRef.current.keys()]) {
        if (
          desired.has(pluginId) &&
          (!target.extensionAvailability ||
            target.extensionAvailability[pluginId] === "available")
        ) {
          continue;
        }
        try {
          await disable(pluginId);
        } catch (error) {
          errors[pluginId] =
            error instanceof Error ? error : new Error(String(error));
        }
      }

      const additions: Array<{
        plugin: PluginDefinition;
        pluginId: string;
        revision: string;
      }> = [];
      const candidates: Array<{
        active?: ActivePlugin;
        pluginId: string;
        revision: string;
      }> = [];
      for (const pluginId of desired) {
        const availability = target.extensionAvailability?.[pluginId];
        if (availability && availability !== "available") {
          errors[pluginId] = new Error(
            `Extension "${pluginId}" is unavailable (${availability})`
          );
          continue;
        }
        const revision = target.runtimeRevisions[pluginId];
        if (!revision) {
          errors[pluginId] = new Error(
            `Extension "${pluginId}" has no loadable runtime revision`
          );
          continue;
        }
        const active = pluginsRef.current.get(pluginId);
        if (active?.revision === revision) {
          continue;
        }
        candidates.push({ active, pluginId, revision });
      }

      // Downloads and sandbox registration are independent. Keep lifecycle
      // mutations ordered below so dependency activation/replacement stays intact.
      const pending = candidates.map(async (candidate) => {
        try {
          return {
            ...candidate,
            error: undefined,
            plugin: await load(candidate.pluginId, candidate.revision),
          };
        } catch (error) {
          return {
            ...candidate,
            error: error instanceof Error ? error : new Error(String(error)),
            plugin: undefined,
          };
        }
      });
      for (const request of pending) {
        // Earlier replacements need not wait for later downloads to finish.
        const { active, error, plugin, pluginId, revision } = await request;
        if (!plugin) {
          errors[pluginId] = error;
          continue;
        }
        if (epoch !== epochRef.current) {
          unloadPluginRef.current?.(pluginId, revision);
          errors[pluginId] = new Error(
            `Extension "${pluginId}" load was cancelled`
          );
          continue;
        }
        if (!active) {
          additions.push({ plugin, pluginId, revision });
          continue;
        }
        let result: PluginInitResult;
        try {
          result = await reloadPlugin(
            plugin,
            deps,
            unregisterPluginRef.current
          );
        } catch (error) {
          unloadPluginRef.current?.(pluginId, revision);
          errors[pluginId] =
            error instanceof Error ? error : new Error(String(error));
          continue;
        }
        if (!result.success) {
          unloadPluginRef.current?.(pluginId, revision);
          errors[pluginId] =
            result.error ??
            new Error(`Failed to replace extension "${pluginId}"`);
          continue;
        }
        if (epoch !== epochRef.current) {
          await cleanupPlugins([plugin]).catch(() => undefined);
          unloadPluginRef.current?.(pluginId, revision);
          errors[pluginId] = new Error(
            `Extension "${pluginId}" load was cancelled`
          );
          continue;
        }
        pluginsRef.current.set(pluginId, { plugin, revision });
        unloadPluginRef.current?.(pluginId, active.revision);
      }

      if (epoch !== epochRef.current) {
        for (const { pluginId, revision } of additions) {
          unloadPluginRef.current?.(pluginId, revision);
          errors[pluginId] = new Error(
            `Extension "${pluginId}" load was cancelled`
          );
        }
        return errors;
      }
      if (additions.length > 0) {
        const definitions = additions.map(({ plugin }) => plugin);
        const initialized = await initializePlugins(definitions, deps);
        if (epoch !== epochRef.current) {
          await cleanupPlugins(definitions).catch(() => undefined);
        }
        const initializedById = new Map(
          initialized.map((result) => [result.pluginId, result])
        );
        for (const addition of additions) {
          const result = initializedById.get(addition.pluginId);
          if (result?.success && epoch === epochRef.current) {
            pluginsRef.current.set(addition.pluginId, {
              plugin: addition.plugin,
              revision: addition.revision,
            });
            continue;
          }
          unloadPluginRef.current?.(addition.pluginId, addition.revision);
          errors[addition.pluginId] =
            epoch === epochRef.current
              ? (result?.error ??
                new Error(
                  `Failed to initialize extension "${addition.pluginId}"`
                ))
              : new Error(
                  `Extension "${addition.pluginId}" load was cancelled`
                );
        }
      }

      return errors;
    },
    [cleanupPlugins, deps, disable, initializePlugins, load, reloadPlugin]
  );

  const dispose = useCallback(() => {
    epochRef.current += 1;
    const plugins = [...pluginsRef.current.values()];
    pluginsRef.current.clear();
    loadingRef.current.clear();
    void Promise.resolve(cleanupPlugins(plugins.map(({ plugin }) => plugin)))
      .catch(() => undefined)
      .finally(() => {
        for (const { plugin, revision } of plugins) {
          unloadPluginRef.current?.(plugin.manifest.id, revision);
        }
      });
  }, [cleanupPlugins]);

  return { disable, dispose, enable, initialize, reconcile };
}
