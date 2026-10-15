import { expect, it } from "vitest";
import { getAvailablePluginRegistry } from "./access";

it("keeps built-in Agent Work out of the extension registry", () => {
  const registry = getAvailablePluginRegistry();
  expect(registry.allExtensionIds).not.toContain("lunaris.ai-chat");
  expect(registry.allExtensionIds).not.toContain("system-agent-work");
  expect(registry.extensionMetadata["lunaris.ai-chat"]).toBeUndefined();
});
