const readbackTimeoutMs = 5 * 60_000;

export class TransientRegistryError extends Error {}

interface ReadbackOptions {
  log?: (message: string) => void;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Publish once; tolerate registry propagation without accepting different bytes. */
export async function ensureNpmPublication(
  tag: string,
  integrity: string,
  inspect: (signal: AbortSignal) => Promise<string | null>,
  publish: () => void,
  {
    log = console.log,
    now = () => performance.now(),
    sleep = (milliseconds) => Bun.sleep(milliseconds),
  }: ReadbackOptions = {}
) {
  let deadline = now() + readbackTimeoutMs;
  let published = false;
  let delay = 1000;
  let attempt = 0;
  let reason = "version missing";
  while (now() < deadline) {
    attempt++;
    let actual: string | null;
    try {
      actual = await inspect(
        AbortSignal.timeout(Math.max(1, Math.ceil(deadline - now())))
      );
    } catch (error) {
      if (!(error instanceof TransientRegistryError)) {
        throw error;
      }
      reason = error.message;
      log(`${tag}: attempt ${attempt}; registry error: ${reason}`);
      // A failed lookup is not evidence that publishing is safe.
      const remaining = deadline - now();
      if (remaining > 0) {
        const wait = Math.min(delay, remaining);
        log(`${tag}: retry in ${wait}ms; expected integrity ${integrity}`);
        await sleep(wait);
        delay = Math.min(delay * 2, 30_000);
      }
      continue;
    }
    log(
      `${tag}: attempt ${attempt}; expected integrity ${integrity}; actual integrity ${actual ?? "missing"}`
    );
    if (actual !== null) {
      if (actual !== integrity) {
        throw new Error(
          `${tag} has different bytes; expected integrity ${integrity}; actual integrity ${actual}; publish a new version`
        );
      }
      log(
        `${tag}: verified${published ? " after publish" : "; skipping existing version"}`
      );
      return;
    }
    reason = "version missing";
    if (!published) {
      log(`${tag}: publishing once; expected integrity ${integrity}`);
      publish();
      published = true;
      deadline = now() + readbackTimeoutMs;
      delay = 1000;
      continue;
    }
    const remaining = deadline - now();
    if (remaining > 0) {
      const wait = Math.min(delay, remaining);
      log(`${tag}: retry in ${wait}ms; reason: ${reason}`);
      await sleep(wait);
      delay = Math.min(delay * 2, 30_000);
    }
  }
  throw new Error(
    `npm readback timed out for ${tag} after ${readbackTimeoutMs}ms; attempts ${attempt}; expected integrity ${integrity}; last reason: ${reason}`
  );
}

/** Only transport failures, throttling, and server errors are retryable. */
export async function inspectNpmIntegrity(url: string, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
  } catch (error) {
    throw new TransientRegistryError(
      `Cannot inspect npm ${url}: ${String(error)}`
    );
  }
  if (response.status === 404) {
    return null;
  }
  if ([408, 429].includes(response.status) || response.status >= 500) {
    throw new TransientRegistryError(
      `Cannot inspect npm ${url}: HTTP ${response.status}`
    );
  }
  if (!response.ok) {
    throw new Error(`Cannot inspect npm ${url}: HTTP ${response.status}`);
  }
  let metadata: { dist?: { integrity?: unknown } };
  try {
    metadata = await response.json();
  } catch (error) {
    throw new TransientRegistryError(
      `Cannot read npm metadata ${url}: ${String(error)}`
    );
  }
  if (typeof metadata.dist?.integrity !== "string") {
    throw new Error(`Invalid npm integrity metadata for ${url}`);
  }
  return metadata.dist.integrity;
}
