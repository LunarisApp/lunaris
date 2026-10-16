import { safeFetch } from "@app/http-client/safe-fetch";

const MAX_MARKETPLACE_BYTES = 5_000_000;

export async function fetchMarketplaceJson(
  url: string,
  options: { allowPrivate?: boolean } = {}
): Promise<unknown> {
  const allowPrivateNetwork = options.allowPrivate ?? false;
  const response = await safeFetch(url, {
    accept: "application/json",
    allowNonStandardPorts: true,
    allowPrivateNetwork,
    allowedProtocols: allowPrivateNetwork ? ["http:", "https:"] : ["https:"],
    maxBytes: MAX_MARKETPLACE_BYTES,
    signal: AbortSignal.timeout(10_000),
    userAgent: "Lunaris/1.0",
  });
  return JSON.parse(response.body.toString("utf8"));
}
