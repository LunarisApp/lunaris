import { describe, expect, it } from "vitest";
import {
  MAX_PLUGIN_DOWNLOAD_BYTES,
  assertPluginDownloadInput,
} from "./runtime-context";

describe("plugin downloads", () => {
  it("accepts valid binary downloads without changing their bytes", () => {
    const data = new Uint8Array([0, 127, 128, 255]).buffer;
    const input = {
      data,
      mimeType: "application/pdf",
      suggestedName: "report.pdf",
    };

    expect(() => assertPluginDownloadInput(input)).not.toThrow();
    expect([...new Uint8Array(input.data)]).toEqual([0, 127, 128, 255]);
  });

  it("rejects invalid names, MIME types, and data over 64 MiB", () => {
    expect(() => assertPluginDownloadInput({
      data: new ArrayBuffer(0),
      mimeType: "application/pdf",
      suggestedName: "../report.pdf",
    })).toThrow("invalid filename");
    expect(() => assertPluginDownloadInput({
      data: new ArrayBuffer(0),
      mimeType: "application/pdf",
      suggestedName: "report?.pdf",
    })).toThrow("invalid filename");
    expect(() => assertPluginDownloadInput({
      data: new ArrayBuffer(0),
      mimeType: "application/pdf",
      suggestedName: ".",
    })).toThrow("invalid filename");
    expect(() => assertPluginDownloadInput({
      data: new ArrayBuffer(0),
      mimeType: "pdf",
      suggestedName: "report.pdf",
    })).toThrow("invalid MIME type");
    expect(() => assertPluginDownloadInput({
      data: new ArrayBuffer(MAX_PLUGIN_DOWNLOAD_BYTES + 1),
      mimeType: "application/pdf",
      suggestedName: "report.pdf",
    })).toThrow("64 MiB");
  });
});
