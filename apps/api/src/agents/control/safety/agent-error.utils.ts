export function agentErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return "INTERNAL_ERROR";
  }
  const candidate = error as {
    code?: unknown;
    status?: unknown;
  };
  if (typeof candidate.code === "string") {
    return candidate.code;
  }
  return typeof candidate.status === "number"
    ? `HTTP_${candidate.status}`
    : "INTERNAL_ERROR";
}

export function asError(cause: unknown, message: string) {
  return cause instanceof Error ? cause : new Error(message, { cause });
}
