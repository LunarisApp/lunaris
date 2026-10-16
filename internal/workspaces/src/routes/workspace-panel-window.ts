import {
  buildPanelWindowPath,
  type Panel,
  type PanelWindowDescriptor,
  panelKind,
  panelWindowDescriptorFromPanel,
  panelWindowDescriptorSchema,
} from "@repo/workspaces/grid-layout";
import {
  PanelWindowError,
  type PanelWindowFailureReason,
  type PanelWindowManager,
  type PanelWindowOpenRequest,
} from "@repo/platform";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { toast } from "sonner";

const READY_TIMEOUT_MS = 15_000;

function failureReason(error: unknown): PanelWindowFailureReason {
  return error instanceof PanelWindowError ? error.reason : "open_failed";
}

function reportWindowFailure(
  errorMessage: string,
  eventName: string,
  properties: Record<string, string>,
  error?: unknown
) {
  log.error({
    action: "panel_window.open",
    outcome: "failure",
    panelWindow: {
      failureReason: properties.failure_reason,
      operation: eventName.startsWith("panel_move") ? "move" : "open",
      ...(properties.panel_kind ? { panelKind: properties.panel_kind } : {}),
      ...(properties.platform ? { platform: properties.platform } : {}),
    },
    ...(properties.plugin_id || properties.renderer
      ? {
          panel: {
            pluginId: properties.plugin_id,
            renderer: properties.renderer,
          },
        }
      : {}),
    ...(error === undefined ? {} : { error: parseError(error) }),
  });
  toast.error(errorMessage);
  posthog.capture(eventName, properties);
  return false;
}

function withTimeout(ready: Promise<void>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new PanelWindowError("timeout", "Panel window timed out")),
      READY_TIMEOUT_MS
    );
  });
  return Promise.race([ready, expired]).finally(() => clearTimeout(timeout));
}

function createOpenRequest({
  descriptor,
  manager,
  workspacePath,
}: {
  descriptor: PanelWindowDescriptor;
  manager: PanelWindowManager;
  workspacePath: string;
}): PanelWindowOpenRequest {
  const transferId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const windowId = `panel-${crypto.randomUUID()}`;

  return {
    path: buildPanelWindowPath({
      descriptor,
      path: workspacePath,
      sourceWindowId: manager.currentWindowId,
      token,
      transferId,
      windowId,
    }),
    title: descriptor.title ? `${descriptor.title} — Lunaris` : "Lunaris",
    token,
    transferId,
    windowId,
  };
}

export async function moveWorkspacePanelToWindow({
  errorMessage,
  manager,
  panel,
  workspacePath,
}: {
  errorMessage: string;
  manager?: PanelWindowManager;
  panel: Panel;
  workspacePath: string;
}) {
  if (!manager) {
    return reportWindowFailure(errorMessage, "panel_move_to_window_failed", {
      failure_reason: "manager_unavailable",
    });
  }

  let descriptor;
  try {
    descriptor = panelWindowDescriptorFromPanel(panel);
  } catch (error) {
    return reportWindowFailure(
      errorMessage,
      "panel_move_to_window_failed",
      {
        failure_reason: "invalid_descriptor",
        platform: manager.platform,
        plugin_id: panel.pluginId,
        renderer: panel.renderer,
      },
      error
    );
  }

  return openWorkspacePanelWindow({
    descriptor,
    errorMessage,
    failureEventName: "panel_move_to_window_failed",
    manager,
    workspacePath,
    successEventName: "panel_moved_to_window",
  });
}

async function openWorkspacePanelWindow({
  descriptor,
  errorMessage,
  failureEventName,
  manager,
  workspacePath,
  successEventName,
}: {
  descriptor: PanelWindowDescriptor;
  errorMessage: string;
  failureEventName: string;
  manager: PanelWindowManager;
  workspacePath: string;
  successEventName: string;
}) {
  let handle;
  try {
    const request = createOpenRequest({
      descriptor,
      manager,
      workspacePath,
    });
    handle = manager.open(request);
    await withTimeout(handle.ready);
    posthog.capture(successEventName, {
      panel_kind: panelKind(descriptor),
      platform: manager.platform,
      extension_id: descriptor.extensionId,
      view_id: descriptor.viewId,
    });
    return true;
  } catch (error) {
    handle?.close();
    return reportWindowFailure(
      errorMessage,
      failureEventName,
      {
        failure_reason: failureReason(error),
        panel_kind: panelKind(descriptor),
        platform: manager.platform,
        extension_id: descriptor.extensionId,
        view_id: descriptor.viewId,
      },
      error
    );
  }
}

export async function openWorkspacePanelInNewWindow({
  descriptor: input,
  errorMessage,
  manager,
  workspacePath,
}: {
  descriptor: PanelWindowDescriptor;
  errorMessage: string;
  manager?: PanelWindowManager;
  workspacePath: string;
}) {
  if (!manager) {
    return reportWindowFailure(
      errorMessage,
      "panel_open_in_new_window_failed",
      { failure_reason: "manager_unavailable" }
    );
  }

  let descriptor: PanelWindowDescriptor;
  try {
    descriptor = panelWindowDescriptorSchema.parse(input);
  } catch (error) {
    return reportWindowFailure(
      errorMessage,
      "panel_open_in_new_window_failed",
      {
        failure_reason: "invalid_descriptor",
        platform: manager.platform,
        extension_id: input.extensionId,
        view_id: input.viewId,
      },
      error
    );
  }

  return openWorkspacePanelWindow({
    descriptor,
    errorMessage,
    failureEventName: "panel_open_in_new_window_failed",
    manager,
    workspacePath,
    successEventName: "panel_opened_in_new_window",
  });
}
