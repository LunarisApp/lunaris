import { describe, expect, it } from "bun:test";
import { fetchClientMetadataResource } from "./cimd-transport";

describe("CIMD transport", () => {
  it("rejects plaintext and credentials before opening a connection", async () => {
    await expect(
      fetchClientMetadataResource("http://example.com/client.json")
    ).rejects.toThrow("Invalid CIMD request");
    await expect(
      fetchClientMetadataResource(
        "https://user:password@example.com/client.json"
      )
    ).rejects.toThrow();
  });
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "localhost"])(
    "rejects special-use address %s",
    async (host) => {
      await expect(
        fetchClientMetadataResource(`https://${host}/client.json`)
      ).rejects.toThrow("public-routable");
    }
  );
});
