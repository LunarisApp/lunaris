import { useEffect, useState } from "react";

const gravatarUrlCache = new Map<string, string>();
const emailHashPromises = new Map<string, Promise<string>>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getCacheKey(normalizedEmail: string, size?: number): string {
  return `${normalizedEmail}:${size ?? ""}`;
}

async function hashEmail(email: string): Promise<string> {
  const encoded = new TextEncoder().encode(email);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getHashPromise(normalizedEmail: string): Promise<string> {
  const cached = emailHashPromises.get(normalizedEmail);
  if (cached) {
    return cached;
  }

  const promise = hashEmail(normalizedEmail).catch((error) => {
    emailHashPromises.delete(normalizedEmail);
    throw error;
  });
  emailHashPromises.set(normalizedEmail, promise);
  return promise;
}

function buildGravatarUrl(hash: string, size?: number): string {
  return `https://gravatar.com/avatar/${hash}?d=404${size ? `&s=${size}` : ""}`;
}

function getCachedGravatarUrl(
  email: string | null | undefined,
  size?: number
): string | undefined {
  if (!email) {
    return undefined;
  }

  return gravatarUrlCache.get(getCacheKey(normalizeEmail(email), size));
}

export function useGravatarUrl(
  email: string | null | undefined,
  size?: number
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    getCachedGravatarUrl(email, size)
  );

  useEffect(() => {
    if (!email) {
      setUrl(undefined);
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const cacheKey = getCacheKey(normalizedEmail, size);
    const cachedUrl = gravatarUrlCache.get(cacheKey);
    if (cachedUrl) {
      setUrl(cachedUrl);
      return;
    }

    let cancelled = false;
    getHashPromise(normalizedEmail).then(
      (hash) => {
        const nextUrl = buildGravatarUrl(hash, size);
        gravatarUrlCache.set(cacheKey, nextUrl);
        if (!cancelled) {
          setUrl(nextUrl);
        }
      },
      () => {
        // Keep the fallback when Web Crypto is unavailable.
      }
    );

    return () => {
      cancelled = true;
    };
  }, [email, size]);

  return url;
}
