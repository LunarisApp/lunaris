import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDocxImage } from "./images";

let decodeFails = false;
class TestImage {
  naturalWidth = 2000;
  naturalHeight = 1000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => (decodeFails ? this.onerror?.() : this.onload?.()));
  }
}
beforeEach(() => {
  decodeFails = false;
  vi.stubGlobal("Image", TestImage);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fetchImage(type: string) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(new Blob(["image bytes"], { type })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("DOCX images", () => {
  it("fetches original URL directly, limits width, preserves ratio and cleans up", async () => {
    const fetchMock = fetchImage("image/png");
    const result = await loadDocxImage(
      "https://example.com/private-image",
      2000,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/private-image",
      { signal: expect.any(AbortSignal) },
    );
    expect(result.transformation).toEqual({ width: 624, height: 312 });
    expect(result.type).toBe("png");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-image");
  });

  it("uses configured preview width", async () => {
    fetchImage("image/jpeg");
    expect(
      (await loadDocxImage("data:image/jpeg;base64,a", 100)).transformation,
    ).toEqual({ width: 100, height: 50 });
  });

  it("converts browser-decodable formats to PNG", async () => {
    fetchImage("image/webp");
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback) => callback(new Blob(["png"])),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      canvas as unknown as HTMLCanvasElement,
    );
    const result = await loadDocxImage("https://example.com/a.webp");
    expect(result.type).toBe("png");
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(TestImage),
      0,
      0,
      624,
      312,
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-image");
  });

  it("rejects HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(loadDocxImage("https://example.com/missing")).rejects.toThrow(
      "Image request failed (404)",
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("releases URLs after decode failure", async () => {
    fetchImage("image/png");
    decodeFails = true;
    await expect(loadDocxImage("blob:broken")).rejects.toThrow(
      "Image could not be decoded",
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-image");
  });
});
