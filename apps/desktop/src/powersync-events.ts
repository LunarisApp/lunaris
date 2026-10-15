import type { SyncBlocker } from "@repo/data/core";
import { listen } from "@tauri-apps/api/event";

const UPLOAD_EVENT = "powersync-upload";

interface UploadOutcome {
  handle: number;
  status?: number;
  type: "client-error" | "error" | "success";
}

function applyUploadOutcome(syncBlocker: SyncBlocker, outcome: UploadOutcome) {
  if (outcome.type === "success") syncBlocker.recordSuccess();
  else if (outcome.type === "client-error" && outcome.status) {
    syncBlocker.recordClientError(outcome.status);
  } else syncBlocker.recordNonClientError();
}

export async function subscribeToPowerSyncUploads(
  handle: number,
  syncBlocker: SyncBlocker,
) {
  const unlisten = await listen<UploadOutcome>(UPLOAD_EVENT, ({ payload }) => {
    if (payload.handle === handle) applyUploadOutcome(syncBlocker, payload);
  });
  let listening = true;
  return () => {
    if (!listening) return;
    listening = false;
    unlisten();
  };
}
