import type {
  CaptureResult,
  PostHog,
  PostHogConfig,
  Properties,
} from "posthog-js";
import { scrubTelemetryProperties } from "./scrub";

type BrowserPostHogClient = Pick<PostHog, "init" | "register" | "reset">;

export interface BrowserPostHogOptions {
  apiHost: string | undefined;
  appSurface: "desktop" | "landing" | "web";
  appVersion?: string;
  autocapture?: boolean;
  capturePageview?: PostHogConfig["capture_pageview"];
  cookielessMode?: PostHogConfig["cookieless_mode"];
  environment: string;
  key: string | undefined;
  optOutCapturingByDefault?: boolean;
  optOutPersistenceByDefault?: boolean;
  persistence: PostHogConfig["persistence"];
  uiHost: string | undefined;
}

const registeredContexts = new WeakMap<object, Properties>();

export function scrubPostHogCapture(
  capture: CaptureResult | null
): CaptureResult | null {
  if (!capture) return null;
  return {
    ...capture,
    properties:
      (scrubTelemetryProperties(capture.properties) as Properties) ?? {},
    ...(capture.$set
      ? {
          $set:
            (scrubTelemetryProperties(capture.$set) as Properties) ?? {},
        }
      : {}),
    ...(capture.$set_once
      ? {
          $set_once:
            (scrubTelemetryProperties(capture.$set_once) as Properties) ?? {},
        }
      : {}),
  };
}

/**
 * Initializes one privacy-safe PostHog browser client. Product apps use
 * explicit semantic events; the landing site may opt into autocapture.
 */
export function initPostHogBrowser(
  client: BrowserPostHogClient,
  options: BrowserPostHogOptions
): boolean {
  if (!options.key || !options.apiHost || !options.uiHost) return false;

  client.init(options.key, {
    api_host: options.apiHost,
    ui_host: options.uiHost,
    defaults: "2026-01-30",
    autocapture: options.autocapture ?? false,
    before_send: scrubPostHogCapture,
    capture_exceptions: {
      capture_console_errors: false,
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
    },
    capture_heatmaps: false,
    capture_pageleave: true,
    capture_pageview: options.capturePageview ?? false,
    cookieless_mode: options.cookielessMode,
    disable_session_recording: true,
    mask_all_element_attributes: true,
    mask_all_text: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: [
      "code",
      "email",
      "invite",
      "redirectTo",
      "token",
    ],
    person_profiles: "identified_only",
    opt_out_capturing_by_default: options.optOutCapturingByDefault ?? false,
    opt_out_persistence_by_default:
      options.optOutPersistenceByDefault ?? false,
    persistence: options.persistence,
    respect_dnt: true,
  });

  const context: Properties = {
    app_surface: options.appSurface,
    environment: options.environment,
    ...(options.appVersion ? { app_version: options.appVersion } : {}),
  };
  registeredContexts.set(client, context);
  client.register(context);
  return true;
}

/**
 * Clears person, group, and session state while restoring app-level context
 * that PostHog reset removes.
 */
export function resetPostHogIdentity(client: BrowserPostHogClient): void {
  client.reset();
  const context = registeredContexts.get(client);
  if (context) client.register(context);
}
