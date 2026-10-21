export class RailwayPackagingError extends Error {}

/** Only the pinned CLI's local archive-walk error proves upload never started. */
export function parseRailwayUpload(result: {
  ok: boolean;
  text: string;
  stderr: string;
}): string {
  if (result.ok) {
    try {
      const upload: { deploymentId?: unknown } = JSON.parse(result.text);
      if (typeof upload.deploymentId === "string" && upload.deploymentId) {
        return upload.deploymentId;
      }
    } catch {
      // Successful exit without a readable ID still has an unknown outcome.
    }
  } else if (!(result.stderr && result.text)) {
    for (const output of [result.stderr, result.text]) {
      try {
        const error: { code?: unknown; error?: unknown } = JSON.parse(output);
        if (
          error.code === "ERROR" &&
          typeof error.error === "string" &&
          /^.+: IO error for operation on .+: No such file or directory \(os error 2\)$/.test(
            error.error
          )
        ) {
          throw new RailwayPackagingError(
            `Railway packaging failed before upload: ${error.error}; fix source paths or .railwayignore, then retry`
          );
        }
      } catch (error) {
        if (error instanceof RailwayPackagingError) {
          throw error;
        }
      }
    }
  }
  throw new Error(
    `Railway upload outcome unknown; reconcile deployment history and receipt before retrying. ${result.stderr || result.text}`
  );
}
