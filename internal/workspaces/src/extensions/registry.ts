import {
  descriptorMetadata,
  loadPluginDescriptor,
  type PluginDefinition,
  type PluginDescriptor,
  type PluginMetadata,
} from "@lunarisapp/plugin-sdk";
import filePluginDescriptor from "@extension/file/descriptor";
import kanbanPluginDescriptor from "@extension/kanban/descriptor";
import richTextPluginDescriptor from "@extension/rich-text/descriptor";
import { log, parseError } from "evlog";

export type { PluginMetadata };

export const PLUGIN_DESCRIPTORS = [
  richTextPluginDescriptor,
  kanbanPluginDescriptor,
  filePluginDescriptor,
] as const satisfies readonly PluginDescriptor[];

export type PluginId = (typeof PLUGIN_DESCRIPTORS)[number]["manifest"]["id"];

export const ALL_PLUGIN_IDS = PLUGIN_DESCRIPTORS.map(
  ({ manifest }) => manifest.id
);
export const PLUGIN_METADATA = Object.fromEntries(
  PLUGIN_DESCRIPTORS.map((descriptor) => [
    descriptor.manifest.id,
    descriptorMetadata(descriptor),
  ])
) as Record<PluginId, PluginMetadata>;
export const PLUGIN_MANIFESTS = Object.fromEntries(
  PLUGIN_DESCRIPTORS.map((descriptor) => [
    descriptor.manifest.id,
    descriptor.manifest,
  ])
) as Record<PluginId, PluginDescriptor["manifest"]>;

const DESCRIPTOR_BY_ID = new Map(
  PLUGIN_DESCRIPTORS.map((descriptor) => [descriptor.manifest.id, descriptor])
);

export function getPluginSubviewRoute(pluginId: string, path: string) {
  return DESCRIPTOR_BY_ID.get(pluginId)?.routes?.find(
    (route) => route.path === path
  );
}

export interface PluginLoadResult {
  error?: Error;
  id: string;
  plugin?: PluginDefinition;
}

export async function loadPlugin(id: string): Promise<PluginLoadResult> {
  const descriptor = DESCRIPTOR_BY_ID.get(id);
  if (!descriptor) {
    return { id, error: new Error(`Unknown extension ID: ${id}`) };
  }

  try {
    return { id, plugin: await loadPluginDescriptor(descriptor) };
  } catch (error) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    log.error({
      action: "plugin.load",
      outcome: "failure",
      plugin: { id },
      error: parseError(normalized),
    });
    return { id, error: normalized };
  }
}

export async function loadPlugins(ids: string[]): Promise<PluginDefinition[]> {
  const results = await Promise.all(ids.map(loadPlugin));
  return results.flatMap(({ plugin }) => (plugin ? [plugin] : []));
}
