import type { IImageOptions } from "docx";

const MAX_IMAGE_WIDTH = 624;
const MAX_IMAGE_HEIGHT = 864;
const IMAGE_TIMEOUT_MS = 15_000;

// Fetch directly: resource URLs must never pass through a third-party proxy.
export async function loadDocxImage(
  source: string,
  preferredWidth?: number
): Promise<IImageOptions> {
  const response = await fetch(source, {
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        image.src = "";
        reject(new Error("Image decode timed out"));
      }, IMAGE_TIMEOUT_MS);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Image could not be decoded"));
      };
      image.src = url;
    });
    if (!(image.naturalWidth && image.naturalHeight)) {
      throw new Error("Image has no dimensions");
    }
    const width =
      preferredWidth && preferredWidth > 0
        ? preferredWidth
        : image.naturalWidth;
    const scale = Math.min(
      width / image.naturalWidth,
      MAX_IMAGE_WIDTH / image.naturalWidth,
      MAX_IMAGE_HEIGHT / image.naturalHeight
    );
    const transformation = {
      width: Math.max(1, Math.round(image.naturalWidth * scale)),
      height: Math.max(1, Math.round(image.naturalHeight * scale)),
    };
    const type =
      blob.type === "image/png"
        ? "png"
        : blob.type === "image/jpeg"
          ? "jpg"
          : blob.type === "image/gif"
            ? "gif"
            : blob.type === "image/bmp"
              ? "bmp"
              : undefined;
    if (type) {
      return {
        data: new Uint8Array(await blob.arrayBuffer()),
        type,
        transformation,
      };
    }
    const canvas = document.createElement("canvas");
    canvas.width = transformation.width;
    canvas.height = transformation.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Image conversion unavailable");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image conversion failed")),
        "image/png"
      )
    );
    return {
      data: new Uint8Array(await png.arrayBuffer()),
      type: "png",
      transformation,
    };
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}
