import {
  type ApplyExtensionRuntimeChange,
  ExtensionRegistryProvider,
  subscribeToWorkspaceExtensionChanges,
} from "@repo/workspaces/extensions";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AvailablePluginRegistry,
  useAvailablePluginRegistry,
} from "./access";

export interface PluginRuntimeTarget {
  enabledExtensionIds: readonly string[];
  extensionAvailability: AvailablePluginRegistry["extensionAvailability"];
  runtimeRevisions: Record<string, string>;
}

export type PluginRuntimeReconciler = (
  target: PluginRuntimeTarget
) => Promise<Record<string, Error | undefined>>;

interface OrganizationPluginRuntimeValue extends AvailablePluginRegistry {
  registerRuntimeReconciler: (
    reconciler: PluginRuntimeReconciler
  ) => () => void;
}

const OrganizationPluginRuntimeContext =
  createContext<OrganizationPluginRuntimeValue | null>(null);

interface RuntimeWaiter {
  change: Parameters<ApplyExtensionRuntimeChange>[0];
  reject: (error: Error) => void;
  resolve: () => void;
}

class WorkspaceRuntimeController {
  private failedExtensionIds = new Set<string>();
  private readonly onFailuresChanged: (
    extensionIds: ReadonlySet<string>
  ) => void;
  private reconciler: PluginRuntimeReconciler | null = null;
  private reconcilerEpoch = 0;
  private running = false;
  private target: PluginRuntimeTarget | null = null;
  private waiters = new Set<RuntimeWaiter>();

  constructor(onFailuresChanged: (extensionIds: ReadonlySet<string>) => void) {
    this.onFailuresChanged = onFailuresChanged;
  }

  readonly apply: ApplyExtensionRuntimeChange = (change) =>
    new Promise<void>((resolve, reject) => {
      this.waiters.add({ change, reject, resolve });
      this.schedule();
    });

  register = (reconciler: PluginRuntimeReconciler) => {
    this.reconciler = reconciler;
    this.reconcilerEpoch += 1;
    this.schedule();
    return () => {
      if (this.reconciler === reconciler) {
        this.reconciler = null;
        this.reconcilerEpoch += 1;
      }
    };
  };

  refresh() {
    this.schedule();
  }

  setTarget(target: PluginRuntimeTarget) {
    this.target = target;
    this.schedule();
  }

  private matches(waiter: RuntimeWaiter, target: PluginRuntimeTarget) {
    const enabled = target.enabledExtensionIds.includes(
      waiter.change.extensionId
    );
    if (enabled !== waiter.change.enabled) {
      return false;
    }
    if (
      waiter.change.enabled &&
      target.extensionAvailability[waiter.change.extensionId] !== "available"
    ) {
      return true;
    }
    if (!waiter.change.revision) {
      return true;
    }
    return (
      target.runtimeRevisions[waiter.change.extensionId] ===
      waiter.change.revision
    );
  }

  private schedule() {
    if (this.running || !this.reconciler || !this.target) {
      return;
    }
    this.running = true;
    void this.run();
  }

  private updateFailures(
    errors: Record<string, Error | undefined>,
    target: PluginRuntimeTarget
  ) {
    const next = new Set(this.failedExtensionIds);
    for (const extensionId of next) {
      if (!(extensionId in target.runtimeRevisions)) {
        next.delete(extensionId);
      }
    }
    for (const extensionId of target.enabledExtensionIds) {
      if (errors[extensionId] ?? errors["*"]) {
        next.add(extensionId);
      } else {
        next.delete(extensionId);
      }
    }
    if (
      next.size === this.failedExtensionIds.size &&
      [...next].every((extensionId) => this.failedExtensionIds.has(extensionId))
    ) {
      return;
    }
    this.failedExtensionIds = next;
    this.onFailuresChanged(next);
  }

  private async run() {
    try {
      while (this.reconciler && this.target) {
        const reconciler = this.reconciler;
        const reconcilerEpoch = this.reconcilerEpoch;
        const target = this.target;
        const errors: Record<string, Error | undefined> = await reconciler(
          target
        ).catch((error: unknown) => ({
          "*": error instanceof Error ? error : new Error(String(error)),
        }));
        if (reconcilerEpoch !== this.reconcilerEpoch) {
          continue;
        }
        this.updateFailures(errors, target);
        for (const waiter of [...this.waiters]) {
          if (!this.matches(waiter, target)) {
            continue;
          }
          this.waiters.delete(waiter);
          const error = errors[waiter.change.extensionId] ?? errors["*"];
          if (error) {
            waiter.reject(error);
          } else {
            waiter.resolve();
          }
        }
        if (target === this.target && reconciler === this.reconciler) {
          break;
        }
      }
    } finally {
      this.running = false;
      if (this.reconciler && this.target) {
        const pending = [...this.waiters].some((waiter) =>
          this.matches(waiter, this.target!)
        );
        if (pending) {
          this.schedule();
        }
      }
    }
  }
}

const noRuntimeReconciler = () => () => undefined;

export function OrganizationPluginRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const registry = useAvailablePluginRegistry();
  const value = {
    ...registry,
    registerRuntimeReconciler: noRuntimeReconciler,
  };

  return (
    <OrganizationPluginRuntimeContext.Provider value={value}>
      <ExtensionRegistryProvider
        allExtensionIds={registry.allExtensionIds}
        bundledExtensionIds={registry.bundledExtensionIds}
        defaultExtensionIds={registry.defaultExtensionIds}
        enabledExtensionIds={registry.enabledExtensionIds}
        extensionAvailability={registry.extensionAvailability}
        extensionMetadata={registry.extensionMetadata}
        runtimeRevisions={registry.runtimeRevisions}
      >
        {children}
      </ExtensionRegistryProvider>
    </OrganizationPluginRuntimeContext.Provider>
  );
}

export function WorkspacePluginRuntimeProvider({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const registry = useAvailablePluginRegistry(workspaceId);
  const [runtimeFailureIds, setRuntimeFailureIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const mountedRef = useRef(true);
  const controllerRef = useRef<WorkspaceRuntimeController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new WorkspaceRuntimeController((extensionIds) => {
      if (mountedRef.current) {
        setRuntimeFailureIds(extensionIds);
      }
    });
  }
  const controller = controllerRef.current;
  const readyRegistryRef = useRef<AvailablePluginRegistry | null>(null);
  if (!registry.pending) {
    readyRegistryRef.current = registry;
  }
  const stableRegistry = readyRegistryRef.current ?? registry;
  const extensionAvailability = useMemo(() => {
    if (runtimeFailureIds.size === 0) {
      return stableRegistry.extensionAvailability;
    }
    const next = { ...stableRegistry.extensionAvailability };
    for (const extensionId of runtimeFailureIds) {
      if (next[extensionId] === "available") {
        next[extensionId] = "load-failure";
      }
    }
    return next;
  }, [runtimeFailureIds, stableRegistry.extensionAvailability]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (registry.pending) {
      return;
    }
    controller.setTarget({
      enabledExtensionIds: registry.enabledExtensionIds,
      extensionAvailability: registry.extensionAvailability,
      runtimeRevisions: registry.runtimeRevisions,
    });
  }, [
    controller,
    registry.enabledExtensionIds,
    registry.extensionAvailability,
    registry.pending,
    registry.runtimeRevisions,
  ]);

  useEffect(
    () =>
      subscribeToWorkspaceExtensionChanges(workspaceId, () => {
        void registry.refreshWorkspaceExtensions();
        controller.refresh();
      }),
    [controller, workspaceId, registry.refreshWorkspaceExtensions]
  );

  const value = useMemo<OrganizationPluginRuntimeValue>(
    () => ({
      ...stableRegistry,
      registerRuntimeReconciler: controller.register,
    }),
    [controller.register, stableRegistry]
  );

  return (
    <OrganizationPluginRuntimeContext.Provider value={value}>
      <ExtensionRegistryProvider
        allExtensionIds={stableRegistry.allExtensionIds}
        applyRuntimeChange={controller.apply}
        bundledExtensionIds={stableRegistry.bundledExtensionIds}
        defaultExtensionIds={stableRegistry.defaultExtensionIds}
        enabledExtensionIds={stableRegistry.enabledExtensionIds}
        extensionAvailability={extensionAvailability}
        extensionMetadata={stableRegistry.extensionMetadata}
        runtimeRevisions={stableRegistry.runtimeRevisions}
      >
        {children}
      </ExtensionRegistryProvider>
    </OrganizationPluginRuntimeContext.Provider>
  );
}

export function useOrganizationPluginRuntime(): OrganizationPluginRuntimeValue {
  const value = useContext(OrganizationPluginRuntimeContext);
  if (!value) {
    throw new Error(
      "useOrganizationPluginRuntime must be used within OrganizationPluginRuntimeProvider"
    );
  }
  return value;
}
