function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export async function fingerprintValue(value: unknown) {
  return hashString(canonicalJson(value));
}

export async function hashString(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return encodeBytes(new Uint8Array(digest));
}

export function randomToken() {
  return encodeBytes(crypto.getRandomValues(new Uint8Array(32)));
}

function encodeBytes(value: Uint8Array) {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");
}
