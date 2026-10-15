import {
  LogLevels,
  type LogRecord,
  type PowerSyncLogger,
} from "@powersync/common";
import { log, parseError } from "evlog";

const loggerLevels = new WeakMap<PowerSyncLogger, { minimumLevel: number }>();

function shouldForwardDebugLogs(debugMode?: boolean) {
  if (debugMode != null) return debugMode;

  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  return meta.env?.DEV === true;
}

function formatPowerSyncArg(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) return undefined;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizePowerSyncArg(value: unknown) {
  if (value instanceof Error) return parseError(value);
  return value;
}

function createPowerSyncPayload(messages: unknown[]) {
  const firstError = messages.find((value) => value instanceof Error);
  const text = messages.map(formatPowerSyncArg).filter(Boolean).join(" ").trim();

  return {
    tag: "Sync" as const,
    source: "powersync" as const,
    msg: text || "powersync event",
    details: messages
      .filter((value) => !(value instanceof Error))
      .map(normalizePowerSyncArg),
    error: firstError instanceof Error ? parseError(firstError) : undefined,
  };
}

export function createPowerSyncLogger(debugMode?: boolean): PowerSyncLogger {
  const state = {
    minimumLevel: shouldForwardDebugLogs(debugMode)
      ? LogLevels.debug
      : LogLevels.info,
  };

  const write = ({ error, level, message }: LogRecord) => {
    if (level < state.minimumLevel) return;

    const payload = createPowerSyncPayload(
      error === undefined ? [message] : [message, error]
    );
    if (level >= LogLevels.error) {
      log.error(payload);
    } else if (level >= LogLevels.warn) {
      log.warn(payload);
    } else if (level >= LogLevels.info) {
      log.info(payload);
    } else {
      log.debug(payload);
    }
  };

  const logger: PowerSyncLogger = {
    log: write,
  };
  loggerLevels.set(logger, state);
  return logger;
}

export function setPowerSyncLoggerDebugMode(
  logger: PowerSyncLogger,
  debugMode: boolean
) {
  const state = loggerLevels.get(logger);
  if (state) {
    state.minimumLevel = debugMode ? LogLevels.debug : LogLevels.warn;
  }
}
