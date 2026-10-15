import { describe, expect, it, vi } from "vitest";

vi.mock("./provider", () => ({
  ExtensionHostProvider: () => null,
  usePluginHostLifecycle: () => ({}),
}));

import {
  loadWorkspacePluginIds,
  ExtensionHostProvider,
  usePluginRuntimeHost,
  usePluginHostLifecycle,
} from "./index";

describe("extension host surface", () => {
  it("exports one provider and its workspace-scoped lifecycle", () => {
    expect(ExtensionHostProvider).toBeTypeOf("function");
    expect(usePluginRuntimeHost).toBeTypeOf("function");
    expect(usePluginHostLifecycle).toBeTypeOf("function");
    expect(loadWorkspacePluginIds).toBeTypeOf("function");
  });
});
