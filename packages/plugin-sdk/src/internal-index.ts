export type { PluginDataCapabilities } from "./data-adapter";
export type { PluginContributionStore, PluginSdkRuntime } from "./provider";
export {
  ExtensionSdkProvider,
  usePluginSdkRuntime,
} from "./provider";
export type { PluginHostCapabilities } from "./runtime-context";
export { ExtensionScopeProvider, usePluginPermission } from "./scope";
export {
  assertSandboxIcon,
  cloneSandboxJsonValue,
  cloneSandboxWireValue,
} from "./sandbox-protocol";
