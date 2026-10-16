import { cloneSandboxWireValue } from "@lunarisapp/plugin-sdk/internal";
import { describe, expect, it, vi } from "vitest";
import { toPluginLocale } from "./locale";

describe("extension locale", () => {
  it("excludes host-only locale capabilities from sandbox RPC", () => {
    const runtimeLocale = {
      locale: "en",
      setLocale: vi.fn(),
    };
    const host = { locale: toPluginLocale(runtimeLocale) };

    expect(host).toEqual({ locale: { locale: "en" } });
    expect(
      cloneSandboxWireValue(
        {
          host,
          id: "render-1",
          params: {},
          renderer: "renderer:lunaris.demo:default",
          type: "render",
        },
        "Host RPC request"
      )
    ).toEqual({
      host,
      id: "render-1",
      params: {},
      renderer: "renderer:lunaris.demo:default",
      type: "render",
    });
    expect(
      cloneSandboxWireValue(
        { host, id: "render-1", type: "snapshot" },
        "Host RPC snapshot"
      )
    ).toEqual({ host, id: "render-1", type: "snapshot" });
    expect(runtimeLocale.setLocale).not.toHaveBeenCalled();
  });
});
