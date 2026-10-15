import { expect, test } from "bun:test";
import { ConfigService } from "@nestjs/config";
import { StorageConfig } from "./storage.config";
import { StorageService } from "./storage.service";

test("signs browser transfers against public endpoint while retaining internal storage endpoint", async () => {
  const config = new StorageConfig(new ConfigService({
    AWS_ENDPOINT_URL: "http://127.0.0.1:3900",
    AWS_PUBLIC_ENDPOINT_URL: "https://notes.example.com",
    AWS_DEFAULT_REGION: "garage",
    AWS_S3_BUCKET: "lunaris",
    AWS_ACCESS_KEY_ID: "test-key",
    AWS_SECRET_ACCESS_KEY: "test-secret",
  }));
  const storage = new StorageService(config);
  try {
    expect(config.endpoint).toBe("http://127.0.0.1:3900");
    for (const signed of [
      await storage.getSignedUploadUrl("sample.txt", "text/plain"),
      await storage.getSignedDownloadUrl("sample.txt"),
      await storage.signPart("sample.txt", "upload-id", 1, 100),
    ]) {
      const url = new URL(signed);
      expect(url.origin).toBe("https://notes.example.com");
      expect(url.pathname).toBe("/lunaris/sample.txt");
      expect(url.searchParams.has("X-Amz-Signature")).toBe(true);
    }
  } finally {
    await storage.onModuleDestroy();
  }
});
