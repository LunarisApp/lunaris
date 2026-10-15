type PgError = {
  code?: string;
  constraint?: string;
};

function getPgError(error: unknown): PgError | null {
  if (!(error instanceof Error)) return null;

  if (typeof (error as PgError).code === "string") {
    return error as PgError;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    return cause as PgError;
  }

  return null;
}

export function isUniqueViolation(
  error: unknown,
  constraintPart?: string,
): error is Error & { code: string; constraint?: string } {
  const pgError = getPgError(error);
  if (pgError?.code !== "23505") return false;
  if (!constraintPart) return true;
  return pgError.constraint?.includes(constraintPart) ?? false;
}
