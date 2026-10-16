import { useState } from "react";
import { useApi } from "../../api";
import { useAuth } from "../context";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const OUTPUT_SIZE = 256;
const WEBP_QUALITY = 0.85;

async function processImage(file: File): Promise<Blob> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File too large");
  }

  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d")!;

  const sSize = Math.min(img.width, img.height);
  const sx = (img.width - sSize) / 2;
  const sy = (img.height - sSize) / 2;
  ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  URL.revokeObjectURL(url);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
  );
  if (!blob) {
    throw new Error("Failed to convert image");
  }
  return blob;
}

export function useAvatarUpload() {
  const api = useApi();
  const auth = useAuth();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File): Promise<void> {
    setUploading(true);
    try {
      const blob = await processImage(file);

      const { uploadUrl, key } = await api.post<{
        uploadUrl: string;
        key: string;
      }>("/v1/account/avatar/upload-url", {
        body: { resource: "image/webp" },
      });

      const s3Res = await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "image/webp" },
      });
      if (!s3Res.ok) {
        throw new Error("Upload failed");
      }

      const { imageUrl } = await api.post<{ imageUrl: string }>(
        "/v1/account/avatar/confirm",
        { body: { key } }
      );

      await auth.updateUser({ image: imageUrl });
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading };
}
