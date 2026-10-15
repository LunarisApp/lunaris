import { describe, expect, it } from "bun:test";
import { fetchMarketplaceJson } from "./marketplace-http";

describe("fetchMarketplaceJson", () => {
  it.each([
    "https://127.0.0.1/marketplace.json",
    "https://localhost/marketplace.json",
    "https://metadata.internal/marketplace.json",
    "https://user:secret@example.com/marketplace.json",
  ])("rejects unsafe marketplace URL %s", async (url) => {
    await expect(fetchMarketplaceJson(url)).rejects.toThrow();
  });
});
