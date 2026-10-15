/**
 * Normalize a workspace name into a safe filename slug. Non-alphanumeric chars
 * drop, runs of whitespace collapse to a single hyphen, everything
 * lower-cased. Empty input becomes "export".
 */
function sanitizeWorkspaceName(workspaceName: string): string {
  return workspaceName
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/** Build the final `.pdf` filename for a workspace. */
export function buildExportFilename(workspaceName: string): string {
  const slug = sanitizeWorkspaceName(workspaceName);
  return `${slug || "export"}-export.pdf`;
}

const REVOKE_DELAY_MS = 10_000;

/**
 * Trigger a browser download for the given blob. Revokes the object URL
 * after a short delay so the download request has time to fire.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
