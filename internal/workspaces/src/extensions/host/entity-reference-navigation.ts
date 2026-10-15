import type { PluginEntityReference } from "@lunarisapp/plugin-sdk";

export function getEntityReferencePath(
  organizationSlug: string,
  workspaceSlug: string,
  reference: PluginEntityReference
): string {
  const workspacePath = `/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(workspaceSlug)}`;
  return reference.type === "workspace"
    ? workspacePath
    : `${workspacePath}/${encodeURIComponent(reference.resourceId)}`;
}
