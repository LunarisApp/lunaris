import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("bundle retries recover transient downloads and preserve other failures", () => {
  for (const [message, failures, attempts, exitCode] of [
    ["failed to bundle project: `http status: 504`", 1, 2, 0],
    ["failed to bundle project: `http status: 429`", 3, 3, 7],
    ["failed to bundle project: `http status: 404`", 1, 1, 7],
    ["compiler error", 1, 1, 7],
  ] as const) {
    const root = mkdtempSync(join(tmpdir(), "lunaris-bundle-retry-"));
    try {
      writeFileSync(join(root, "sleep"), "#!/bin/sh\nexit 0\n", {
        mode: 0o755,
      });
      const command = join(root, "build.sh");
      writeFileSync(
        command,
        `#!/bin/bash
count=0
if [ -f "$COUNT_FILE" ]; then count=$(cat "$COUNT_FILE"); fi
count=$((count + 1))
echo "$count" > "$COUNT_FILE"
if [ "$count" -le "$FAILURES" ]; then
  printf '%s\\n' "$MESSAGE"
  exit 7
fi
`
      );
      const count = join(root, "count");
      const result = Bun.spawnSync(
        ["bash", resolve("tooling/delivery/retry-bundle.sh"), "bash", command],
        {
          env: {
            ...process.env,
            PATH: `${root}:${process.env.PATH}`,
            COUNT_FILE: count,
            MESSAGE: message,
            FAILURES: String(failures),
          },
        }
      );
      expect(result.exitCode).toBe(exitCode);
      expect(Number(readFileSync(count, "utf8"))).toBe(attempts);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
