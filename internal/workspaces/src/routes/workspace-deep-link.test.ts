import { describe, expect, it } from "vitest";
import { resolveWorkspaceView } from "./workspace-deep-link";

describe("Agent Work routes", () => {
  const context = {
    organizationSlug: "team",
    workspaceSlug: "notes",
    resourcesMap: new Map(),
  };

  it.each(["lunaris.ai-chat", "view:lunaris.ai-chat"])(
    "redirects the saved %s route without an extension",
    (viewId) => {
      expect(resolveWorkspaceView({ ...context, viewId })).toEqual({
        kind: "redirect",
        to: "/team/notes/agent-work",
      });
    }
  );

  it("resolves the built-in panel without registered extension views", () => {
    expect(
      resolveWorkspaceView({ ...context, viewId: "agent-work" })
    ).toMatchObject({
      kind: "tool",
      tool: { toolId: "agent-work", pluginId: "system-agent-work" },
    });
  });
});
