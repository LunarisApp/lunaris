"use client";

import type { AppPermission } from "@repo/auth/permissions";
import { createContext, type ReactNode, useContext } from "react";

export type PermissionCheck = (permission: AppPermission) => boolean;

const allowAllPermissions: PermissionCheck = () => true;

const PermissionContext = createContext<PermissionCheck>(allowAllPermissions);

export function PermissionProvider({
  check = allowAllPermissions,
  children,
}: {
  check?: PermissionCheck;
  children: ReactNode;
}) {
  return (
    <PermissionContext.Provider value={check}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissionCheck(): PermissionCheck {
  return useContext(PermissionContext);
}

export function usePermission(permission: AppPermission): boolean {
  return usePermissionCheck()(permission);
}

export function useAllPermissions(
  permissions: readonly AppPermission[]
): boolean {
  const check = usePermissionCheck();
  return permissions.every(check);
}

export function useAnyPermission(
  permissions: readonly AppPermission[]
): boolean {
  const check = usePermissionCheck();
  return permissions.some(check);
}

export function requirePermission(
  check: PermissionCheck,
  requiredPermission: AppPermission
): void {
  if (!check(requiredPermission)) {
    throw new Error(
      `Permission denied: ${requiredPermission.resource}.${requiredPermission.action}`
    );
  }
}
