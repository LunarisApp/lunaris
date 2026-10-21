import { readFileSync } from "node:fs";

export async function waitForReady(
  url: string,
  options: {
    alive: () => boolean;
    timeoutMs?: number;
    intervalMs?: number;
    request?: (url: string, options?: RequestInit) => Promise<Response>;
  }
) {
  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  let last = "no response";
  while (Date.now() < deadline) {
    if (!options.alive()) {
      throw new Error(`Server exited before readiness: ${url}; ${last}`);
    }
    try {
      const response = await (options.request ?? fetch)(url, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(5000, deadline - Date.now()))
        ),
      });
      if (response.ok) {
        return;
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = String(error);
    }
    await Bun.sleep(options.intervalMs ?? 1000);
  }
  throw new Error(`Readiness timed out: ${url}; ${last}`);
}

if (import.meta.main) {
  const [url, pidFile] = process.argv.slice(2);
  if (!(url && pidFile)) {
    throw new Error("Usage: readiness.ts URL PID_FILE");
  }
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error("Invalid server PID");
  }
  await waitForReady(url, {
    alive: () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
  });
}
