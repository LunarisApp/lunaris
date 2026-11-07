import type { AppUpdateState } from "@repo/features/app-update";
import { serializeErrorForLog } from "@repo/utils/log-error";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { log } from "evlog";
import { useEffect, useState } from "react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type DesktopUpdate = Pick<Update, "version" | "download" | "install" | "close">;

function reportError(action: string, error: unknown) {
  log.warn({ action, error: serializeErrorForLog(error), outcome: "failure" });
}

export function startDesktopAppUpdateChecks(
  onChange: (state: AppUpdateState) => void,
  dependencies: {
    check: () => Promise<DesktopUpdate | null>;
    relaunch: () => Promise<void>;
  } = { check: () => check({ timeout: 10_000 }), relaunch }
): () => void {
  let disposed = false;
  let checking = false;
  let updating = false;
  let downloaded = false;
  let installed = false;
  let available: DesktopUpdate | null = null;

  const close = (update: DesktopUpdate) => {
    void update.close().catch((error: unknown) => {
      reportError("desktop.update.close", error);
    });
  };
  const publish = (state: Partial<AppUpdateState> = {}) => {
    if (!disposed) {
      onChange({
        needRefresh: available !== null,
        requiresRestart: true,
        update: applyUpdate,
        ...state,
      });
    }
  };
  const applyUpdate = async () => {
    const update = available;
    if (disposed || updating || !update) {
      return;
    }
    updating = true;
    try {
      if (!downloaded) {
        publish({ phase: "downloading" });
        let received = 0;
        let total: number | undefined;
        let lastProgress: number | undefined;
        await update.download(
          (event) => {
            if (event.event === "Started") {
              total = event.data.contentLength;
              received = 0;
            } else if (event.event === "Progress") {
              received += event.data.chunkLength;
            }
            const progress = total
              ? Math.min(100, Math.floor((received / total) * 100))
              : undefined;
            if (progress !== lastProgress) {
              lastProgress = progress;
              publish({ phase: "downloading", progress });
            }
          },
          { timeout: 10 * 60 * 1000 }
        );
        downloaded = true;
      }
      if (!installed) {
        publish({ phase: "installing" });
        await update.install();
        installed = true;
      }
      publish({ phase: "restarting" });
      await dependencies.relaunch();
    } catch (error) {
      reportError("desktop.update.apply", error);
      publish({ failed: true });
    } finally {
      updating = false;
      if (disposed) {
        close(update);
      }
    }
  };
  const checkForUpdate = async () => {
    if (
      disposed ||
      checking ||
      available ||
      !navigator.onLine ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    checking = true;
    try {
      const update = await dependencies.check();
      if (disposed) {
        if (update) {
          close(update);
        }
        return;
      }
      available = update;
      publish();
    } catch (error) {
      reportError("desktop.update.check", error);
    } finally {
      checking = false;
    }
  };
  const requestCheck = () => void checkForUpdate();
  const interval = window.setInterval(requestCheck, UPDATE_CHECK_INTERVAL_MS);
  window.addEventListener("online", requestCheck);
  document.addEventListener("visibilitychange", requestCheck);
  requestCheck();

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    window.clearInterval(interval);
    window.removeEventListener("online", requestCheck);
    document.removeEventListener("visibilitychange", requestCheck);
    if (available && !updating) {
      close(available);
    }
  };
}

export function useDesktopAppUpdate(): AppUpdateState | undefined {
  const [state, setState] = useState<AppUpdateState>();
  useEffect(() => {
    // Detached resource windows must not start competing installers.
    if (getCurrentWindow().label !== "main") {
      return;
    }
    let disposed = false;
    let stop: (() => void) | undefined;
    void invoke<boolean>("desktop_updater_enabled")
      .then((enabled) => {
        if (enabled && !disposed) {
          stop = startDesktopAppUpdateChecks(setState);
        }
      })
      .catch((error: unknown) =>
        reportError("desktop.update.configure", error)
      );
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  return state;
}
