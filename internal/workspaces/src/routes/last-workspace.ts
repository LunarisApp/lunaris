interface LastWorkspace {
  viewPath: string;
  workspaceId: string;
}

function storageKey(userId: string, organizationId: string) {
  return `lunaris:last-workspace:${encodeURIComponent(userId)}:${encodeURIComponent(organizationId)}`;
}

export function readLastWorkspace(
  userId: string,
  organizationId: string,
): LastWorkspace | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey(userId, organizationId)) ?? "null",
    );
    if (
      !value ||
      typeof value !== "object" ||
      !("workspaceId" in value) ||
      !("viewPath" in value)
    )
      return null;
    if (
      typeof value.workspaceId !== "string" ||
      typeof value.viewPath !== "string"
    )
      return null;
    // Only route segments; never restore query parameters or external URLs.
    if (!/^(?:\/[a-zA-Z0-9_-]+)*$/.test(value.viewPath)) return null;
    return { workspaceId: value.workspaceId, viewPath: value.viewPath };
  } catch {
    return null;
  }
}

export function rememberWorkspace(
  userId: string,
  organizationId: string,
  value: LastWorkspace,
) {
  try {
    localStorage.setItem(
      storageKey(userId, organizationId),
      JSON.stringify(value),
    );
  } catch {
    // Session restoration is optional when browser storage is unavailable.
  }
}
