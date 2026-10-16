export const DEFAULT_WORKSPACE_SEED_MARKER_KEY =
  "lunaris_pending_default_workspace_seed";

type DefaultWorkspaceSeedMarker =
  | { kind: "anonymous" }
  | { email: string; kind: "registered" };

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function markDefaultWorkspaceSeedPending(
  marker: DefaultWorkspaceSeedMarker
) {
  if (!canUseLocalStorage()) {
    return;
  }
  localStorage.setItem(
    DEFAULT_WORKSPACE_SEED_MARKER_KEY,
    JSON.stringify(marker)
  );
}

export function readDefaultWorkspaceSeedMarker(): DefaultWorkspaceSeedMarker | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  const raw = localStorage.getItem(DEFAULT_WORKSPACE_SEED_MARKER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DefaultWorkspaceSeedMarker>;
    let marker: DefaultWorkspaceSeedMarker | null = null;
    if (parsed.kind === "anonymous") {
      marker = { kind: "anonymous" };
    }
    if (
      parsed.kind === "registered" &&
      typeof parsed.email === "string" &&
      parsed.email.length > 0
    ) {
      marker = { kind: "registered", email: parsed.email };
    }
    return marker;
  } catch {
    return null;
  }
}

export function clearDefaultWorkspaceSeedMarker() {
  if (!canUseLocalStorage()) {
    return;
  }
  localStorage.removeItem(DEFAULT_WORKSPACE_SEED_MARKER_KEY);
}
