import {
  preparePluginActivation,
  type PluginDefinition,
  type PluginDisposable,
  type PreparedPluginActivation,
} from "@lunarisapp/plugin-sdk";
import { Context, Service, type Fiber, type FiberState } from "cordis";
import { satisfies } from "semver";

export type PluginRuntimeState =
  | "active"
  | "activating"
  | "deactivating"
  | "failed"
  | "inactive"
  | "pending";

export interface PluginDependencyIssue {
  pluginId: string;
  range: string;
  version?: string;
}

export interface PluginEffectDiagnostic {
  children: PluginEffectDiagnostic[];
  label: string;
}

export interface PluginRuntimeDiagnostic {
  activationCount: number;
  dependencyIssues: PluginDependencyIssue[];
  effects: PluginEffectDiagnostic[];
  error?: unknown;
  pluginId: string;
  state: PluginRuntimeState;
  version: string;
}

export type PluginRuntimeDiagnosticsListener = (
  diagnostics: readonly PluginRuntimeDiagnostic[],
) => void;

export interface PluginContributionCommitter<TDependencies> {
  commit(
    plugin: PluginDefinition,
    activation: PreparedPluginActivation,
    dependencies: TDependencies,
  ): Promise<PluginDisposable> | PluginDisposable;
}

interface PluginDependencyServiceConfig {
  range?: string;
}

class PluginDependencyService extends Service<PluginDependencyServiceConfig> {
  readonly version: string;

  constructor(context: Context, name: string, version: string) {
    super(context, name);
    this.version = version;
  }

  [Service.check](): boolean {
    const { range } = this[Service.resolveConfig]();
    return !range || satisfies(this.version, range);
  }
}

interface RegisteredPlugin<TDependencies> {
  activationCount: number;
  definition: PluginDefinition;
  dependencies: TDependencies;
  disposeContributions?: PluginDisposable;
  disposeService?: PluginDisposable;
  error?: unknown;
  fiber: Fiber;
}

const SERVICE_PREFIX = "lunaris.plugin.";
// Cordis exposes this as an ambient const enum, incompatible with isolatedModules.
const CORDIS_FIBER_STATE = {
  ACTIVE: 2,
  FAILED: 3,
  LOADING: 1,
  PENDING: 0,
  UNLOADING: 5,
} as const;

function serviceName(pluginId: string): string {
  return `${SERVICE_PREFIX}${pluginId}`;
}

function runtimeState(state: FiberState): PluginRuntimeState {
  switch (state) {
    case CORDIS_FIBER_STATE.ACTIVE:
      return "active";
    case CORDIS_FIBER_STATE.LOADING:
      return "activating";
    case CORDIS_FIBER_STATE.UNLOADING:
      return "deactivating";
    case CORDIS_FIBER_STATE.FAILED:
      return "failed";
    case CORDIS_FIBER_STATE.PENDING:
      return "pending";
    default:
      return "inactive";
  }
}

export class PluginRuntime<TDependencies> {
  private readonly context = new Context();
  private readonly committer: PluginContributionCommitter<TDependencies>;
  private readonly diagnosticListeners = new Set<PluginRuntimeDiagnosticsListener>();
  private readonly plugins = new Map<string, RegisteredPlugin<TDependencies>>();
  private readonly terminalDiagnostics = new Map<
    string,
    PluginRuntimeDiagnostic
  >();
  private readonly terminalStates = new Map<string, PluginRuntimeState>();
  private operation: Promise<void> = Promise.resolve();

  constructor(committer: PluginContributionCommitter<TDependencies>) {
    this.committer = committer;
    this.context.on(
      "internal/status",
      () => this.notifyDiagnostics(),
      { global: true },
    );
  }

  get(pluginId: string): PluginDefinition | undefined {
    const plugin = this.plugins.get(pluginId);
    return plugin?.fiber.state === CORDIS_FIBER_STATE.ACTIVE
      ? plugin.definition
      : undefined;
  }

  getState(pluginId: string): PluginRuntimeState {
    const plugin = this.plugins.get(pluginId);
    return plugin
      ? runtimeState(plugin.fiber.state)
      : (this.terminalStates.get(pluginId) ?? "inactive");
  }

  getDiagnostic(pluginId: string): PluginRuntimeDiagnostic | undefined {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return this.terminalDiagnostics.get(pluginId);
    return {
      activationCount: plugin.activationCount,
      dependencyIssues: this.dependencyIssues(plugin.definition),
      effects: plugin.fiber.getEffects(),
      error: plugin.error,
      pluginId,
      state: runtimeState(plugin.fiber.state),
      version: plugin.definition.manifest.version,
    };
  }

  getDiagnostics(): PluginRuntimeDiagnostic[] {
    const pluginIds = new Set([
      ...this.plugins.keys(),
      ...this.terminalDiagnostics.keys(),
    ]);
    return [...pluginIds].flatMap((pluginId) => {
      const diagnostic = this.getDiagnostic(pluginId);
      return diagnostic ? [diagnostic] : [];
    });
  }

  subscribeDiagnostics(listener: PluginRuntimeDiagnosticsListener): PluginDisposable {
    this.diagnosticListeners.add(listener);
    try {
      listener(this.getDiagnostics());
    } catch (error) {
      this.context.logger.error(error);
    }
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  private notifyDiagnostics(): void {
    const diagnostics = this.getDiagnostics();
    for (const listener of this.diagnosticListeners) {
      try {
        listener(diagnostics);
      } catch (error) {
        this.context.logger.error(error);
      }
    }
  }

  private dependencyIssues(
    definition: PluginDefinition,
  ): PluginDependencyIssue[] {
    return Object.entries(definition.manifest.dependencies).flatMap(
      ([pluginId, range]) => {
        const dependency = this.get(pluginId);
        if (dependency && satisfies(dependency.manifest.version, range)) return [];
        return [{ pluginId, range, version: dependency?.manifest.version }];
      },
    );
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private assertConflicts(plugin: PluginDefinition): void {
    for (const [conflictId, range] of Object.entries(plugin.manifest.conflicts)) {
      const conflict = this.plugins.get(conflictId)?.definition;
      if (conflict && satisfies(conflict.manifest.version, range)) {
        throw new Error(
          `Extension "${plugin.manifest.id}" conflicts with "${conflictId}" ${range}`,
        );
      }
    }
    for (const registered of this.plugins.values()) {
      const range = registered.definition.manifest.conflicts[plugin.manifest.id];
      if (range && satisfies(plugin.manifest.version, range)) {
        throw new Error(
          `Extension "${registered.definition.manifest.id}" conflicts with "${plugin.manifest.id}" ${range}`,
        );
      }
    }
  }

  private requirementsError(definition: PluginDefinition): Error {
    const [issue] = this.dependencyIssues(definition);
    if (!issue) {
      return new Error(`Extension "${definition.manifest.id}" is not active`);
    }
    const found = issue.version ? `, found ${issue.version}` : "";
    return new Error(
      `Extension "${definition.manifest.id}" requires "${issue.pluginId}" ${issue.range}${found}`,
    );
  }

  private async registerNow(
    definition: PluginDefinition,
    dependencies: TDependencies,
  ): Promise<void> {
    const pluginId = definition.manifest.id;
    const existing = this.plugins.get(pluginId);
    if (existing) {
      existing.dependencies = dependencies;
      try {
        await existing.fiber.await();
      } catch (error) {
        await this.removeFailedRegistration(pluginId, existing, error);
        throw error;
      }
      return;
    }
    this.assertConflicts(definition);
    this.terminalStates.delete(pluginId);
    this.terminalDiagnostics.delete(pluginId);

    let registered: RegisteredPlugin<TDependencies>;
    const runtimePlugin = {
      inject: Object.fromEntries(
        Object.entries(definition.manifest.dependencies).map(
          ([dependencyId, range]) => [
            serviceName(dependencyId),
            { range } satisfies PluginDependencyServiceConfig,
          ],
        ),
      ),
      name: pluginId,
      apply: async (context: Context) => {
        try {
          const activation = await preparePluginActivation(definition);
          let release: PluginDisposable | undefined;
          const disposeContributions = context.effect(
            () => async () => {
              const errors: unknown[] = [];
              try {
                await release?.();
              } catch (error) {
                errors.push(error);
              }
              try {
                await activation.dispose();
              } catch (error) {
                errors.push(error);
              }
              registered.disposeContributions = undefined;
              if (errors.length) {
                const failure =
                  errors.length === 1
                    ? errors[0]
                    : new AggregateError(
                        errors,
                        `Extension "${pluginId}" contribution cleanup failed`,
                      );
                registered.error = failure;
                this.notifyDiagnostics();
                throw failure;
              }
            },
            `plugin(${JSON.stringify(pluginId)}).contributions`,
          );
          registered.disposeContributions = disposeContributions;
          release = await this.committer.commit(
            definition,
            activation,
            registered.dependencies,
          );
          await activation.start();
          // A child fiber lets teardown withdraw the service before contributions.
          const serviceFiber = context.plugin({
            name: `${pluginId}:service`,
            apply(serviceContext: Context) {
              new PluginDependencyService(
                serviceContext,
                serviceName(pluginId),
                definition.manifest.version,
              );
            },
          });
          registered.disposeService = serviceFiber.dispose;
          await serviceFiber.await();
          registered.activationCount += 1;
          registered.error = undefined;
        } catch (error) {
          registered.error = error;
          throw error;
        }
      },
    };

    const fiber = this.context.plugin(runtimePlugin);
    registered = {
      activationCount: 0,
      definition,
      dependencies,
      fiber,
    };
    this.plugins.set(pluginId, registered);
    this.notifyDiagnostics();
    try {
      await fiber.await();
    } catch (error) {
      await this.removeFailedRegistration(pluginId, registered, error);
      throw error;
    }
  }

  private async removeFailedRegistration(
    pluginId: string,
    registered: RegisteredPlugin<TDependencies>,
    activationError: unknown,
  ): Promise<void> {
    const cleanupErrors: unknown[] = [];
    try {
      await registered.disposeContributions?.();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await registered.fiber.dispose();
    } catch (error) {
      cleanupErrors.push(error);
    }
    const failure = cleanupErrors.length
      ? new AggregateError(
          [activationError, ...cleanupErrors],
          `Extension "${pluginId}" activation and rollback failed`,
        )
      : activationError;
    this.plugins.delete(pluginId);
    this.terminalStates.set(pluginId, "failed");
    this.terminalDiagnostics.set(pluginId, {
      activationCount: registered.activationCount,
      dependencyIssues: this.dependencyIssues(registered.definition),
      effects: [],
      error: failure,
      pluginId,
      state: "failed",
      version: registered.definition.manifest.version,
    });
    this.notifyDiagnostics();
    if (cleanupErrors.length) throw failure;
  }

  async register(
    definition: PluginDefinition,
    dependencies: TDependencies,
  ): Promise<void> {
    return this.enqueue(() => this.registerNow(definition, dependencies));
  }

  private async awaitActivationNow(pluginId: string): Promise<void> {
    const registered = this.plugins.get(pluginId);
    if (!registered) throw new Error(`Extension "${pluginId}" is not registered`);
    try {
      await registered.fiber.await();
    } catch (error) {
      if (this.plugins.get(pluginId) === registered) {
        await this.removeFailedRegistration(pluginId, registered, error);
      }
      throw error;
    }
    if (registered.fiber.state === CORDIS_FIBER_STATE.PENDING) {
      throw this.requirementsError(registered.definition);
    }
    if (registered.fiber.state !== CORDIS_FIBER_STATE.ACTIVE) {
      throw registered.error ?? new Error(`Extension "${pluginId}" is not active`);
    }
  }

  async awaitActivation(pluginId: string): Promise<void> {
    return this.enqueue(() => this.awaitActivationNow(pluginId));
  }

  async activate(
    definition: PluginDefinition,
    dependencies: TDependencies,
  ): Promise<void> {
    return this.enqueue(async () => {
      await this.registerNow(definition, dependencies);
      await this.awaitActivationNow(definition.manifest.id);
    });
  }

  private async deactivateNow(pluginId: string): Promise<void> {
    const current = this.plugins.get(pluginId);
    if (!current) {
      this.terminalStates.set(pluginId, "inactive");
      this.terminalDiagnostics.delete(pluginId);
      return;
    }
    const errors: unknown[] = [];
    try {
      await current.disposeService?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      await current.disposeContributions?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      await current.fiber.dispose();
    } catch (error) {
      errors.push(error);
    } finally {
      this.plugins.delete(pluginId);
      this.terminalStates.set(pluginId, "inactive");
      this.terminalDiagnostics.delete(pluginId);
      this.notifyDiagnostics();
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `Extension "${pluginId}" cleanup failed`);
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    return this.enqueue(() => this.deactivateNow(pluginId));
  }

  private async replaceNow(
    definition: PluginDefinition,
    dependencies: TDependencies,
  ): Promise<void> {
    const pluginId = definition.manifest.id;
    const previous = this.plugins.get(pluginId);
    if (!previous) {
      await this.registerNow(definition, dependencies);
      return this.awaitActivationNow(pluginId);
    }
    await this.deactivateNow(pluginId);
    try {
      await this.registerNow(definition, dependencies);
      await this.awaitActivationNow(pluginId);
    } catch (error) {
      try {
        await this.registerNow(previous.definition, previous.dependencies);
        await this.awaitActivationNow(pluginId);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Extension "${pluginId}" replacement and rollback failed`,
        );
      }
      throw error;
    }
  }

  async replace(
    definition: PluginDefinition,
    dependencies: TDependencies,
  ): Promise<void> {
    return this.enqueue(() => this.replaceNow(definition, dependencies));
  }

  dispose(): Promise<void> {
    return this.enqueue(async () => {
      const errors: unknown[] = [];
      for (const pluginId of [...this.plugins.keys()]) {
        try {
          await this.deactivateNow(pluginId);
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await this.context.fiber.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, "Extension cleanup failed");
    });
  }
}
