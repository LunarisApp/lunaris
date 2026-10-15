import type {
  PluginContribution,
  PluginDefinition,
  PluginPermission,
  PreparedPluginActivation,
  ResourceCommandItem,
  ResourceCommand,
  ResourceCommandGroup,
  ResourceTypeContribution,
  ResourceViewDefinition,
  ResourceViewProps,
  ResourceViewStatusProps,
  SearchIndexerContext,
  SearchQueryContext,
  SearchQueryOpenContext,
  StandaloneViewProps,
  StandaloneViewDefinition,
  ViewContribution,
} from "@lunarisapp/plugin-sdk";
import { getViewContributions } from "@lunarisapp/plugin-sdk";
import { ExtensionScopeProvider } from "@lunarisapp/plugin-sdk/internal";
import {
  PluginRuntime,
  type PluginRuntimeDiagnostic,
  type PluginRuntimeDiagnosticsListener,
} from "@repo/plugin-runtime";
import { createElement, type ComponentType } from "react";
import {
  type ResourceLayoutWrapper,
  registerResourceViewWithGridLayout,
} from "./grid-layout";
import type { PluginRegistry } from "./registry";

type GridLayoutRegisterFn = Parameters<
  typeof registerResourceViewWithGridLayout
>[0];

interface I18nInstance {
  addResourceBundle(
    language: string,
    namespace: string,
    resources: Record<string, unknown>,
    deep?: boolean,
    overwrite?: boolean,
  ): void;
  getResourceBundle(
    language: string,
    namespace: string,
  ): Record<string, unknown> | undefined;
  removeResourceBundle(language: string, namespace: string): void;
}

interface LocaleLanguageState {
  base: Record<string, unknown>;
  plugins: Map<string, Record<string, unknown>>;
}

export interface InitializePluginsDeps {
  gridLayoutRegister: GridLayoutRegisterFn;
  gridLayoutUnregister?: GridLayoutUnregisterCallback;
  i18n?: I18nInstance;
  resourceViewLayoutWrapper?: ResourceLayoutWrapper;
}

export interface PluginInitResult {
  error?: Error;
  pluginId: string;
  success: boolean;
}

export type GridLayoutUnregisterCallback = (
  extensionId: string,
  viewId: string,
) => void;

export interface PluginLifecycle {
  cleanupPlugins(plugins: readonly PluginDefinition[]): Promise<void>;
  disablePlugin(
    pluginId: string,
    gridLayoutUnregisterByPlugin?: (pluginId: string) => void,
  ): Promise<void>;
  getPluginDiagnostics(): PluginRuntimeDiagnostic[];
  initializePlugins(
    plugins: readonly PluginDefinition[],
    deps: InitializePluginsDeps,
  ): Promise<PluginInitResult[]>;
  reloadPlugin(
    plugin: PluginDefinition,
    deps: InitializePluginsDeps,
    gridLayoutUnregisterByPlugin?: (pluginId: string) => void,
  ): Promise<PluginInitResult>;
  subscribePluginDiagnostics(
    listener: PluginRuntimeDiagnosticsListener,
  ): () => void | Promise<void>;
}

function scopedElement<Props extends object>(
  plugin: PluginDefinition,
  renderer: ComponentType<Props>,
  props: Props,
) {
  return createElement(
    ExtensionScopeProvider,
    { extensionId: plugin.manifest.id, permissions: plugin.manifest.permissions },
    createElement(renderer as ComponentType<typeof props>, props),
  );
}

function isResourceView(
  view: ViewContribution,
): view is ViewContribution & ResourceViewDefinition {
  return view.target.kind === "resource";
}

function requirePermission(
  plugin: PluginDefinition,
  permission: PluginPermission,
): void {
  if (!plugin.manifest.permissions.includes(permission)) {
    throw new Error(
      `Extension "${plugin.manifest.id}" has not declared permission "${permission}"`,
    );
  }
}

function throwCollectedErrors(errors: unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

function scopeCommand(
  plugin: PluginDefinition,
  command: ResourceCommand,
): ResourceCommand {
  return {
    ...command,
    onExecute: (context) => {
      requirePermission(plugin, "content.read");
      return command.onExecute(context);
    },
  };
}

function scopeCommands(
  plugin: PluginDefinition,
  commands: readonly ResourceCommandItem[],
): ResourceCommandItem[] {
  return commands.map((command) => {
    if ("children" in command && command.children) {
      return {
        ...command,
        children: command.children.map((child) => scopeCommand(plugin, child)),
      } satisfies ResourceCommandGroup;
    }
    return scopeCommand(plugin, command);
  });
}

function scopeContribution(
  plugin: PluginDefinition,
  contribution: PluginContribution,
): PluginContribution {
  switch (contribution.type) {
    case "resource-type":
      return {
        ...contribution,
        createInWorkspace: contribution.createInWorkspace
          ? (context) => {
              requirePermission(plugin, "content.write");
              return contribution.createInWorkspace!({
                ...context,
                uploadFile: (input) => {
                  requirePermission(plugin, "files.write");
                  return context.uploadFile(input);
                },
              });
            }
          : undefined,
        storage: Object.fromEntries(
          Object.entries(contribution.storage).map(([name, slot]) => [
            name,
            "initialize" in slot && slot.initialize
              ? {
                  ...slot,
                  initialize: (...args: never[]) => {
                    requirePermission(plugin, "content.write");
                    return (slot.initialize as (...values: never[]) => unknown)(...args);
                  },
                }
              : slot,
          ]),
        ) as ResourceTypeContribution["storage"],
      };
    case "workspace-storage":
      return contribution;
    case "view": {
      if (!isResourceView(contribution)) {
        const renderer = contribution.renderer;
        return {
          ...contribution,
          renderer: (props: StandaloneViewProps) =>
            scopedElement(plugin, renderer, props),
        };
      }
      const renderer = contribution.renderer;
      const statusBar = contribution.statusBar;
      return {
        ...contribution,
        renderer: (props: ResourceViewProps) =>
          scopedElement(plugin, renderer, props),
        statusBar:
          statusBar
            ? (props: ResourceViewStatusProps) =>
                scopedElement(plugin, statusBar, props)
            : undefined,
      };
    }
    case "resource-command":
      return { ...contribution, commands: scopeCommands(plugin, contribution.commands) };
    case "search-indexer":
      return {
        ...contribution,
        extractText: (input, context: SearchIndexerContext) => {
          requirePermission(plugin, "content.read");
          return contribution.extractText(input, {
            readFile: (storage) => {
              requirePermission(plugin, "files.read");
              return context.readFile(storage);
            },
          });
        },
      };
    case "search-query":
      return {
        ...contribution,
        query: (input, context: SearchQueryContext) =>
          contribution.query(input, {
            fetch: ((...args: Parameters<SearchQueryContext["fetch"]>) => {
              requirePermission(plugin, "network.https");
              return context.fetch(...args);
            }) as SearchQueryContext["fetch"],
          }),
        open: (result, context: SearchQueryOpenContext) =>
          contribution.open(result, context),
      };
  }
}

function cloneBundle(value: Record<string, unknown> | undefined) {
  return structuredClone(value ?? {});
}

export function createPluginLifecycle({
  plugins,
}: {
  plugins: PluginRegistry;
}): PluginLifecycle {
  const localeStates = new Map<string, LocaleLanguageState>();

  function rebuildLanguage(language: string, i18n: I18nInstance): void {
    const state = localeStates.get(language);
    if (!state) return;
    i18n.removeResourceBundle(language, "translation");
    i18n.addResourceBundle(language, "translation", cloneBundle(state.base), true, true);
    for (const resources of state.plugins.values()) {
      i18n.addResourceBundle(language, "translation", cloneBundle(resources), true, true);
    }
  }

  function registerLocales(
    pluginId: string,
    locales: PreparedPluginActivation["locales"],
    i18n: I18nInstance,
  ): () => void {
    const removeLocales = (languages: readonly string[]): unknown[] => {
      const errors: unknown[] = [];
      for (const language of languages) {
        const state = localeStates.get(language);
        if (!state) continue;
        state.plugins.delete(pluginId);
        try {
          rebuildLanguage(language, i18n);
        } catch (error) {
          errors.push(error);
        }
        if (!state.plugins.size) localeStates.delete(language);
      }
      return errors;
    };

    const languages = Object.keys(locales);
    const registered: string[] = [];
    try {
      for (const language of languages) {
        const state = localeStates.get(language) ?? {
          base: cloneBundle(i18n.getResourceBundle(language, "translation")),
          plugins: new Map(),
        };
        state.plugins.set(pluginId, cloneBundle(locales[language]));
        localeStates.set(language, state);
        registered.push(language);
        rebuildLanguage(language, i18n);
      }
    } catch (error) {
      const rollbackErrors = removeLocales(registered.reverse());
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          `Extension "${pluginId}" locale registration and rollback failed`,
        );
      }
      throw error;
    }
    return () => {
      throwCollectedErrors(
        removeLocales(languages),
        `Extension "${pluginId}" locale cleanup failed`,
      );
    };
  }

  async function commitPlugin(
    plugin: PluginDefinition,
    activation: PreparedPluginActivation,
    deps: InitializePluginsDeps,
  ): Promise<() => Promise<void>> {
    const pluginId = plugin.manifest.id;
    const scopedActivation = {
      ...activation,
      contributions: activation.contributions.map((contribution) =>
        scopeContribution(plugin, contribution),
      ),
    };
    const cleanups: Array<() => Promise<void> | void> = [];
    const release = async () => {
      const errors: unknown[] = [];
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      throwCollectedErrors(errors, `Extension "${pluginId}" cleanup failed`);
    };

    try {
      plugins.transaction(() => {
        cleanups.push(plugins.registerPlugin(plugin));
        for (const contribution of scopedActivation.contributions) {
          switch (contribution.type) {
            case "workspace-storage":
              cleanups.push(plugins.registerWorkspaceStorage(pluginId, contribution));
              break;
            case "resource-type":
              cleanups.push(plugins.registerResourceType(pluginId, contribution));
              break;
            case "view":
              cleanups.push(plugins.registerView(pluginId, contribution));
              break;
            case "resource-command":
              cleanups.push(plugins.registerCommand(pluginId, contribution));
              break;
            case "search-indexer":
              cleanups.push(
                plugins.registerSearchIndexer(pluginId, contribution),
              );
              break;
            case "search-query":
              cleanups.push(
                plugins.registerSearchQuery(pluginId, contribution),
              );
              break;
          }
        }
        for (const service of activation.serviceProviders) {
          cleanups.push(plugins.registerService(pluginId, service));
        }
        for (const slot of activation.slotContributions) {
          cleanups.push(plugins.registerSlotContribution(pluginId, slot));
        }
        for (const view of getViewContributions(scopedActivation)) {
          if (view.target.kind === "resource") {
            registerResourceViewWithGridLayout(
              deps.gridLayoutRegister,
              pluginId,
              view,
              (resourceTypeId) =>
                plugins.getResourceType(resourceTypeId)?.definition,
              { layoutWrapper: deps.resourceViewLayoutWrapper },
            );
            cleanups.push(() =>
              deps.gridLayoutUnregister?.(pluginId, view.viewId),
            );
            continue;
          }
          const renderer = (view as StandaloneViewDefinition).renderer;
          deps.gridLayoutRegister(pluginId, view.viewId, (props) =>
            createElement(renderer, { params: props.params }),
          );
          cleanups.push(() =>
            deps.gridLayoutUnregister?.(pluginId, view.viewId),
          );
        }
      });
      if (deps.i18n) cleanups.push(registerLocales(pluginId, activation.locales, deps.i18n));
      return release;
    } catch (error) {
      await release().catch((cleanupError) => {
        throw new AggregateError([error, cleanupError], "Extension registration failed");
      });
      throw error;
    }
  }

  const runtime = new PluginRuntime<InitializePluginsDeps>({ commit: commitPlugin });

  async function initializePlugins(
    definitions: readonly PluginDefinition[],
    deps: InitializePluginsDeps,
  ): Promise<PluginInitResult[]> {
    const results = new Map<string, PluginInitResult>();
    const failure = (pluginId: string, error: unknown): PluginInitResult =>
      runtime.getState(pluginId) === "pending"
        ? { pluginId, success: true }
        : {
            error: error instanceof Error ? error : new Error(String(error)),
            pluginId,
            success: false,
          };
    for (const plugin of definitions) {
      try {
        await runtime.register(plugin, deps);
      } catch (error) {
        results.set(plugin.manifest.id, failure(plugin.manifest.id, error));
      }
    }
    for (const plugin of definitions) {
      if (results.has(plugin.manifest.id)) continue;
      try {
        await runtime.awaitActivation(plugin.manifest.id);
        results.set(plugin.manifest.id, { pluginId: plugin.manifest.id, success: true });
      } catch (error) {
        results.set(plugin.manifest.id, failure(plugin.manifest.id, error));
      }
    }
    return definitions.map(
      (plugin) =>
        results.get(plugin.manifest.id) ?? {
          error: new Error(`Extension "${plugin.manifest.id}" was not initialized`),
          pluginId: plugin.manifest.id,
          success: false,
        },
    );
  }

  async function cleanupPlugins(definitions: readonly PluginDefinition[]) {
    const errors: unknown[] = [];
    for (const plugin of definitions) {
      try {
        await runtime.deactivate(plugin.manifest.id);
      } catch (error) {
        errors.push(error);
      }
    }
    throwCollectedErrors(errors, "Extension cleanup failed");
  }

  return {
    cleanupPlugins,
    disablePlugin: async (pluginId, unregister) => {
      try {
        await runtime.deactivate(pluginId);
      } finally {
        unregister?.(pluginId);
      }
    },
    getPluginDiagnostics: () => runtime.getDiagnostics(),
    initializePlugins,
    reloadPlugin: async (plugin, deps, unregister) => {
      unregister?.(plugin.manifest.id);
      try {
        await runtime.replace(plugin, deps);
        return { pluginId: plugin.manifest.id, success: true };
      } catch (error) {
        return {
          error: error instanceof Error ? error : new Error(String(error)),
          pluginId: plugin.manifest.id,
          success: false,
        };
      }
    },
    subscribePluginDiagnostics: (listener) => runtime.subscribeDiagnostics(listener),
  };
}
