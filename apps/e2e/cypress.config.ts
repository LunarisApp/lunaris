import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "cypress";

// apps/e2e/package.json is ESM (`"type": "module"`), so __dirname
// is not defined. Derive it from import.meta.url instead.
const DIRNAME = fileURLToPath(new URL(".", import.meta.url));

type AuthAction =
  | "organization-invitation"
  | "reset-password"
  | "verify-email";

interface GetAuthEmailUrlArgs {
  action: AuthAction;
  email: string;
  timeoutMs?: number;
}

interface WaitForSyncOperationArgs {
  logOffset: number;
  operation: string;
  timeoutMs?: number;
}

// Resolve the backend log path. CI sets CYPRESS_BACKEND_LOG_PATH;
// local dev falls back to a monorepo-relative path.
function resolveLogPath(): string {
  if (process.env.CYPRESS_BACKEND_LOG_PATH) {
    return process.env.CYPRESS_BACKEND_LOG_PATH;
  }
  return resolve(DIRNAME, "../api/backend.log");
}

// Better Auth email HTML is logged verbatim via evlog when Resend is null
// (see internal/auth/src/server.ts). Every log line is a JSON object with
// an `auth` field: { action, email, html }. We scan the file from the
// bottom up and return the first match for the requested (email, action).
//
// Defensive NUL-byte stripping: if a prior run truncated the log file
// while the backend had the fd open without O_APPEND, the file may contain
// NUL holes before real content. Strip them so the line split still works.
function scanLogForUrl(
  filePath: string,
  email: string,
  action: AuthAction
): string | null {
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf8");
  const contents = raw.includes("\0") ? raw.replace(/\0+/g, "") : raw;
  const lines = contents.split("\n");
  const normalizedEmail = email.toLowerCase();
  const pathPattern: Record<AuthAction, string> = {
    "organization-invitation": "/auth/accept-invitation",
    "reset-password": "/auth/reset-password",
    "verify-email": "/auth/verify-email",
  };

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    if (!line.startsWith("{")) continue;
    if (!line.includes(`"action":"${action}"`)) continue;
    if (!line.toLowerCase().includes(`"email":"${normalizedEmail}"`)) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // Walk the parsed object to find the `auth.html` field, regardless of
    // how deeply evlog nested it in `properties` / `context` / etc.
    const html = findHtml(parsed, action, normalizedEmail);
    if (!html) continue;

    const match = html.match(
      new RegExp(`href="([^"]*${escapeRegex(pathPattern[action])}[^"]*)"`, "i")
    );
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return null;
}

function hasSyncOperationSince(
  filePath: string,
  logOffset: number,
  operation: string
): boolean {
  if (!existsSync(filePath)) return false;

  const contents = readFileSync(filePath);
  const offset = logOffset <= contents.byteLength ? logOffset : 0;
  return contents.subarray(offset).includes(`"${operation}"`);
}

function findHtml(
  node: unknown,
  action: AuthAction,
  email: string
): string | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const auth = obj.auth;
  if (
    auth &&
    typeof auth === "object" &&
    (auth as Record<string, unknown>).action === action &&
    typeof (auth as Record<string, unknown>).email === "string" &&
    ((auth as Record<string, unknown>).email as string).toLowerCase() === email &&
    typeof (auth as Record<string, unknown>).html === "string"
  ) {
    return (auth as Record<string, unknown>).html as string;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const nested = findHtml(value, action, email);
      if (nested) return nested;
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(url: string): string {
  return url
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/=+$/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export default defineConfig({
  experimentalMemoryManagement: true,
  e2e: {
    baseUrl:
      process.env.CYPRESS_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 5173}`,
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10_000,
    excludeSpecPattern: process.env.CYPRESS_PWA_OFFLINE
      ? undefined
      : "cypress/e2e/offline/**/*.cy.ts",
    video: false,
    specPattern: "cypress/e2e/**/*.cy.ts",
    setupNodeEvents(on, config) {
      const logPath = resolveLogPath();

      on("task", {
        backendLogOffset(): number {
          if (!existsSync(logPath)) return 0;
          return readFileSync(logPath).byteLength;
        },

        generateTotp({ secret }: { secret: string }): string {
          return generateTotp(secret);
        },

        // Poll the backend log file for an email URL matching the target
        // (email, action). Retries until timeoutMs elapses because evlog's
        // emit is async relative to the HTTP response.
        async getAuthEmailUrl({
          email,
          action,
          timeoutMs = 10_000,
        }: GetAuthEmailUrlArgs): Promise<string> {
          const deadline = Date.now() + timeoutMs;
          const interval = 250;
          while (Date.now() < deadline) {
            const url = scanLogForUrl(logPath, email, action);
            if (url) return url;
            await new Promise((resolveP) => setTimeout(resolveP, interval));
          }
          throw new Error(
            `getAuthEmailUrl: no ${action} URL for ${email} in ${logPath} within ${timeoutMs}ms`
          );
        },

        async waitForSyncOperation({
          logOffset,
          operation,
          timeoutMs = 30_000,
        }: WaitForSyncOperationArgs): Promise<boolean> {
          const deadline = Date.now() + timeoutMs;
          const interval = 250;
          while (Date.now() < deadline) {
            if (hasSyncOperationSince(logPath, logOffset, operation)) return true;
            await new Promise((resolveP) => setTimeout(resolveP, interval));
          }
          throw new Error(
            `waitForSyncOperation: no ${operation} in ${logPath} within ${timeoutMs}ms`
          );
        },

        // Expose the resolved log path for debugging.
        authLogPath(): string {
          return logPath;
        },
      });

      return config;
    },
  },
});
