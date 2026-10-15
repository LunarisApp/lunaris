import { permission } from "@repo/auth/permissions";
import { useAllPermissions } from "@repo/features/permissions";

const CREATE_WORKSPACE_PERMISSIONS = [
  permission.workspace.create,
  permission.content.write,
] as const;
const DELETE_WORKSPACE_PERMISSIONS = [
  permission.workspace.delete,
  permission.content.delete,
] as const;

export function useCanCreateWorkspace(): boolean {
  return useAllPermissions(CREATE_WORKSPACE_PERMISSIONS);
}

export function useCanDeleteWorkspace(): boolean {
  return useAllPermissions(DELETE_WORKSPACE_PERMISSIONS);
}
