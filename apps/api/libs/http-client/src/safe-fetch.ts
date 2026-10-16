import { lookup } from "node:dns/promises";
import type { IncomingHttpHeaders, RequestOptions } from "node:http";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import ipaddr from "ipaddr.js";

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_URL_LENGTH = 2048;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

type SafeHttpProtocol = "http:" | "https:";

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface SafeFetchOptions {
  accept?: string;
  allowedProtocols?: readonly SafeHttpProtocol[];
  allowNonStandardPorts?: boolean;
  allowPrivateNetwork?: boolean;
  maxBytes: number;
  maxRedirects?: number;
  maxUrlLength?: number;
  signal: AbortSignal;
  userAgent?: string;
}

export interface SafeFetchResponse {
  body: Buffer;
  headers: IncomingHttpHeaders;
  statusCode: number;
  url: URL;
}

export interface SafeUrlOptions {
  allowedProtocols?: readonly SafeHttpProtocol[];
  allowNonStandardPorts?: boolean;
  allowPrivateNetwork?: boolean;
  maxUrlLength?: number;
}

function normalizeHostname(hostname: string): string {
  const withoutBrackets =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  return withoutBrackets.replace(/\.$/u, "").toLowerCase();
}

export function isPublicIpAddress(value: string): boolean {
  return ipaddr.isValid(value) && ipaddr.process(value).range() === "unicast";
}

export function parseSafeUrl(value: string, options: SafeUrlOptions = {}): URL {
  if (value.length > (options.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH)) {
    throw new Error("URL is too long");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL is invalid");
  }

  const allowedProtocols = options.allowedProtocols ?? ["https:"];
  if (!allowedProtocols.includes(url.protocol as SafeHttpProtocol)) {
    throw new Error("URL uses an unsupported protocol");
  }
  if (url.username || url.password) {
    throw new Error("URL must not contain credentials");
  }
  if (!options.allowNonStandardPorts && url.port) {
    throw new Error("URL must use a standard port");
  }

  const hostname = normalizeHostname(url.hostname);
  const isIpAddress = ipaddr.isValid(hostname);
  if (
    !options.allowPrivateNetwork &&
    (!hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      !(isIpAddress || hostname.includes(".")) ||
      (isIpAddress && !isPublicIpAddress(hostname)))
  ) {
    throw new Error("URL must use a public network address");
  }

  url.hash = "";
  return url;
}

async function resolveAddress(
  hostname: string,
  allowPrivateNetwork: boolean
): Promise<ResolvedAddress> {
  const normalized = normalizeHostname(hostname);
  if (ipaddr.isValid(normalized)) {
    if (!(allowPrivateNetwork || isPublicIpAddress(normalized))) {
      throw new Error("URL resolves to a private network address");
    }
    return {
      address: normalized,
      family: ipaddr.parse(normalized).kind() === "ipv4" ? 4 : 6,
    };
  }

  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("URL hostname could not be resolved");
  }
  if (
    !allowPrivateNetwork &&
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new Error("URL resolves to a private network address");
  }

  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new Error("URL hostname returned an unsupported address");
  }
  return { address: selected.address, family: selected.family };
}

export function getResponseHeader(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestUrl(
  url: URL,
  resolved: ResolvedAddress,
  options: SafeFetchOptions
): Promise<SafeFetchResponse> {
  return new Promise((resolve, reject) => {
    const hostname = normalizeHostname(url.hostname);
    const requestOptions: RequestOptions & { servername?: string } = {
      family: resolved.family,
      headers: {
        ...(options.accept ? { Accept: options.accept } : {}),
        "Accept-Encoding": "identity",
        Host: url.host,
        ...(options.userAgent ? { "User-Agent": options.userAgent } : {}),
      },
      hostname: resolved.address,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      signal: options.signal,
    };
    if (url.protocol === "https:" && !ipaddr.isValid(hostname)) {
      requestOptions.servername = hostname;
    }

    const request = (url.protocol === "https:" ? requestHttps : requestHttp)(
      requestOptions,
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (REDIRECT_STATUS_CODES.has(statusCode)) {
          response.destroy();
          resolve({
            body: Buffer.alloc(0),
            headers: response.headers,
            statusCode,
            url,
          });
          return;
        }

        const contentLength = Number.parseInt(
          getResponseHeader(response.headers, "content-length") ?? "",
          10
        );
        if (
          Number.isFinite(contentLength) &&
          contentLength > options.maxBytes
        ) {
          response.destroy();
          reject(new Error("URL response is too large"));
          return;
        }

        const chunks: Buffer[] = [];
        let byteLength = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += buffer.byteLength;
          if (byteLength > options.maxBytes) {
            response.destroy(new Error("URL response is too large"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: response.headers,
            statusCode,
            url,
          });
        });
        response.on("error", reject);
      }
    );
    request.on("error", reject);
    request.end();
  });
}

async function fetchWithRedirects(
  value: string,
  options: SafeFetchOptions,
  redirectCount: number
): Promise<SafeFetchResponse> {
  const url = parseSafeUrl(value, options);
  const resolved = await resolveAddress(
    url.hostname,
    options.allowPrivateNetwork ?? false
  );
  const response = await requestUrl(url, resolved, options);

  if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
    if (redirectCount >= (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
      throw new Error("URL redirected too many times");
    }
    const location = getResponseHeader(response.headers, "location");
    if (!location) {
      throw new Error("URL returned an invalid redirect");
    }
    return fetchWithRedirects(
      new URL(location, url).toString(),
      options,
      redirectCount + 1
    );
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`URL returned HTTP ${response.statusCode}`);
  }
  const contentEncoding = getResponseHeader(
    response.headers,
    "content-encoding"
  );
  if (contentEncoding && contentEncoding !== "identity") {
    throw new Error("URL returned unsupported compressed content");
  }
  return response;
}

export function safeFetch(
  value: string,
  options: SafeFetchOptions
): Promise<SafeFetchResponse> {
  return fetchWithRedirects(value, options, 0);
}
