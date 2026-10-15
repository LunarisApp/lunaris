import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { PluginPermission } from "./manifest";

interface ExtensionScope {
  extensionId: string;
  permissions: ReadonlySet<PluginPermission>;
}

const ExtensionScopeContext = createContext<ExtensionScope | null>(null);

export function ExtensionScopeProvider({
  children,
  extensionId,
  permissions,
}: {
  children?: ReactNode;
  extensionId: string;
  permissions: readonly PluginPermission[];
}) {
  const scope = useMemo(
    () => ({ extensionId, permissions: new Set(permissions) }),
    [extensionId, permissions],
  );
  return (
    <ExtensionScopeContext.Provider value={scope}>
      {children}
    </ExtensionScopeContext.Provider>
  );
}

export function useExtensionId(): string {
  const scope = useContext(ExtensionScopeContext);
  if (!scope) {
    throw new Error("Extension hook used outside an extension renderer");
  }
  return scope.extensionId;
}

export function usePluginPermission(permission: PluginPermission): void {
  const scope = useContext(ExtensionScopeContext);
  if (!scope) {
    throw new Error("Extension hook used outside an extension renderer");
  }
  if (!scope.permissions.has(permission)) {
    throw new Error(
      `Extension "${scope.extensionId}" has not declared permission "${permission}"`,
    );
  }
}
