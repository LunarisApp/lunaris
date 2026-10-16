import { z } from "zod";
import {
  GRID_LAYOUT_UNLOADED_PARAM,
  type JsonObject,
  type JsonValue,
  type Panel,
} from "./types";

export const PANEL_WINDOW_DESCRIPTOR_LIMIT = 16 * 1024;

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

export const panelWindowDescriptorSchema = z.object({
  extensionId: z.string().min(1),
  params: z.record(z.string(), jsonValueSchema).optional(),
  title: z.string(),
  viewId: z.string().min(1),
});

export type PanelWindowDescriptor = z.infer<typeof panelWindowDescriptorSchema>;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");
}

function base64UrlToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(
    value.replaceAll("-", "+").replaceAll("_", "/") + padding
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function panelWindowDescriptorFromPanel(
  panel: Panel
): PanelWindowDescriptor {
  const params = { ...panel.params };
  delete params[GRID_LAYOUT_UNLOADED_PARAM];
  return panelWindowDescriptorSchema.parse({
    extensionId: panel.pluginId,
    params,
    title: panel.title,
    viewId: panel.renderer,
  });
}

export function encodePanelWindowDescriptor(descriptor: PanelWindowDescriptor) {
  const parsed = panelWindowDescriptorSchema.parse(descriptor);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed));
  if (bytes.byteLength > PANEL_WINDOW_DESCRIPTOR_LIMIT) {
    throw new Error("Panel window descriptor exceeds 16 KiB");
  }
  return bytesToBase64Url(bytes);
}

export function decodePanelWindowDescriptor(value: string) {
  const bytes = base64UrlToBytes(value);
  if (bytes.byteLength > PANEL_WINDOW_DESCRIPTOR_LIMIT) {
    throw new Error("Panel window descriptor exceeds 16 KiB");
  }
  return panelWindowDescriptorSchema.parse(
    JSON.parse(new TextDecoder().decode(bytes))
  );
}

export function panelKind(descriptor: PanelWindowDescriptor) {
  if (typeof descriptor.params?.resourceId === "string") {
    return "resource";
  }
  if (typeof descriptor.params?.toolId === "string") {
    return "tool";
  }
  if (typeof descriptor.params?.routeViewId === "string") {
    return "right_dock";
  }
  return "chrome";
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]!))
    );
  }

  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && jsonValuesEqual(left[key]!, right[key]!)
    )
  );
}

export function jsonObjectsEqual(
  left: JsonObject | undefined,
  right: JsonObject | undefined
) {
  const normalizedLeft = { ...left };
  const normalizedRight = { ...right };
  delete normalizedLeft[GRID_LAYOUT_UNLOADED_PARAM];
  delete normalizedRight[GRID_LAYOUT_UNLOADED_PARAM];
  return jsonValuesEqual(normalizedLeft, normalizedRight);
}
