import { parseError } from "evlog";
import { scrubMaybe, scrubString } from "./scrub";

const MAX_STACK_LENGTH = 12_000;
const MAX_CAUSE_DEPTH = 2;

export interface LogError {
  cause?: LogError;
  code?: string;
  fix?: string;
  message: string;
  name: string;
  stack?: string;
  status: number;
  why?: string;
}

function serialize(error: unknown, depth: number): LogError {
  const parsed = parseError(error);
  const cause =
    error instanceof Error && "cause" in error ? error.cause : undefined;
  const stack =
    error instanceof Error && error.stack
      ? scrubString(error.stack).slice(0, MAX_STACK_LENGTH)
      : undefined;

  return {
    ...(parsed.code ? { code: scrubString(parsed.code) } : {}),
    ...(parsed.fix ? { fix: scrubMaybe(parsed.fix) } : {}),
    message: scrubString(parsed.message),
    name: error instanceof Error ? error.name : "Error",
    ...(stack ? { stack } : {}),
    status: parsed.status,
    ...(parsed.why ? { why: scrubMaybe(parsed.why) } : {}),
    ...(cause !== undefined && depth < MAX_CAUSE_DEPTH
      ? { cause: serialize(cause, depth + 1) }
      : {}),
  };
}

/**
 * Produces JSON-safe, PII-scrubbed error diagnostics for client log transport.
 * Native Error properties are non-enumerable and otherwise lose stack/cause.
 */
export function serializeErrorForLog(error: unknown): LogError {
  return serialize(error, 0);
}
