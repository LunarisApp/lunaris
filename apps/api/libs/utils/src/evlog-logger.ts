import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import { log } from "evlog";

/**
 * Custom NestJS logger that extends ConsoleLogger to route all
 * framework logs through evlog's drain pipeline.
 * Inherits all parameter parsing (context extraction, stack trace detection).
 */
export class EvlogLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    _writeStreamType?: "stdout" | "stderr",
    errorStack?: unknown
  ) {
    for (const message of messages) {
      const event: Record<string, unknown> = { context };
      if (typeof message === "string") {
        event.message = message;
      } else if (message instanceof Error) {
        event.message = message.message;
        event.stack = message.stack;
      } else if (typeof message === "object" && message !== null) {
        Object.assign(event, message);
      } else {
        event.message = String(message);
      }
      if (errorStack) {
        event.stack = String(errorStack);
      }

      switch (logLevel) {
        case "error":
        case "fatal":
          log.error(event);
          break;
        case "warn":
          log.warn(event);
          break;
        case "debug":
        case "verbose":
          log.debug(event);
          break;
        default:
          log.info(event);
          break;
      }
    }
  }
}
