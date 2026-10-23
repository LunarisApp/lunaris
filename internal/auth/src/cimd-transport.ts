import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

/** Resolve once, validate every answer, and pin the connection. Never follow redirects. */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (
  input,
  init
) => {
  const incoming = new Request(input, init);
  const url = new URL(incoming.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["GET", "HEAD"].includes(incoming.method)
  ) {
    throw new TypeError("Invalid CIMD request");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicRoutableHost(address))
  ) {
    throw new TypeError("CIMD requires public-routable addresses");
  }
  const pinned = addresses[0]!;
  const signal = AbortSignal.any([
    incoming.signal,
    AbortSignal.timeout(10_000),
  ]);
  return new Promise((resolve, reject) => {
    const connection = request(
      url,
      {
        agent: false,
        method: incoming.method,
        headers: { ...Object.fromEntries(incoming.headers), host: url.host },
        servername: isIP(url.hostname) ? undefined : url.hostname,
        signal,
        // Bun requests all answers; Node may request only one. Both paths use the same pinned IP.
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [pinned]);
          } else {
            callback(null, pinned.address, pinned.family);
          }
        },
      },
      (response) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(name, item);
            }
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        const status = response.statusCode ?? 502;
        const body =
          incoming.method === "HEAD" || [204, 205, 304].includes(status)
            ? null
            : Readable.toWeb(response);
        resolve(new Response(body as BodyInit | null, { status, headers }));
      }
    );
    connection.once("error", reject);
    connection.end();
  });
};
