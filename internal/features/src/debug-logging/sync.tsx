"use client";

import { setPowerSyncLoggerDebugMode, usePowerSync } from "@repo/data/core";
import { useEffect } from "react";
import { useDebugLogging } from "./context";

export function DebugLoggingSync() {
  const { debugLogging } = useDebugLogging();
  const db = usePowerSync();

  useEffect(() => {
    setPowerSyncLoggerDebugMode(db.logger, debugLogging);
  }, [debugLogging, db]);

  return null;
}
