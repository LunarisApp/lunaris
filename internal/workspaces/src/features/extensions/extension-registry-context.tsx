import type { PluginMetadata } from "@lunarisapp/plugin-sdk";
import { createContext, type ReactNode, useContext } from "react";

export type ExtensionAvailability =
  | "available"
  | "blocked"
  | "catalog-disabled"
  | "corrupt-artifact"
  | "incompatible"
  | "load-failure"
  | "missing-offline-cache"
  | "unknown-release";

export type ExtensionRuntimeOperation =
  | "disable"
  | "enable"
  | "install"
  | "uninstall"
  | "upgrade";

export interface ExtensionRuntimeChange {
  enabled: boolean;
  extensionId: string;
  operation: ExtensionRuntimeOperation;
  revision?: string;
}

export type ApplyExtensionRuntimeChange = (
  change: ExtensionRuntimeChange
) => Promise<void>;

interface ExtensionRegistryContextValue {
  allExtensionIds: readonly string[];
  applyRuntimeChange?: ApplyExtensionRuntimeChange;
  bundledExtensionIds: readonly string[];
  defaultExtensionIds: readonly string[];
  enabledExtensionIds: readonly string[];
  extensionAvailability: Record<string, ExtensionAvailability>;
  extensionMetadata: Record<string, PluginMetadata>;
  runtimeRevisions?: Record<string, string>;
}

const ExtensionRegistryContext =
  createContext<ExtensionRegistryContextValue | null>(null);

export function ExtensionRegistryProvider({
  applyRuntimeChange,
  allExtensionIds,
  bundledExtensionIds = allExtensionIds,
  children,
  defaultExtensionIds = allExtensionIds,
  enabledExtensionIds = defaultExtensionIds,
  extensionAvailability = Object.fromEntries(
    allExtensionIds.map((id) => [id, "available" as const])
  ),
  extensionMetadata,
  runtimeRevisions,
}: Omit<
  ExtensionRegistryContextValue,
  | "bundledExtensionIds"
  | "defaultExtensionIds"
  | "enabledExtensionIds"
  | "extensionAvailability"
> & {
  applyRuntimeChange?: ApplyExtensionRuntimeChange;
  bundledExtensionIds?: readonly string[];
  children: ReactNode;
  defaultExtensionIds?: readonly string[];
  enabledExtensionIds?: readonly string[];
  extensionAvailability?: Record<string, ExtensionAvailability>;
}) {
  return (
    <ExtensionRegistryContext
      value={{
        applyRuntimeChange,
        allExtensionIds,
        bundledExtensionIds,
        defaultExtensionIds,
        enabledExtensionIds,
        extensionAvailability,
        extensionMetadata,
        runtimeRevisions,
      }}
    >
      {children}
    </ExtensionRegistryContext>
  );
}

export function useExtensionRegistry(): ExtensionRegistryContextValue {
  const ctx = useContext(ExtensionRegistryContext);
  if (!ctx) {
    throw new Error(
      "useExtensionRegistry must be used within ExtensionRegistryProvider"
    );
  }
  return ctx;
}
