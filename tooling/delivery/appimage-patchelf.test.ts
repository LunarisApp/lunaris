import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

test.skipIf(process.platform === "win32")(
  "AppImage patching preserves the agent and delegates other operations and failures",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "lunaris-patchelf-"));
    try {
      writeFileSync(
        join(directory, "patchelf"),
        '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\nexit 42\n',
        { mode: 0o755 }
      );
      const run = (args: string[]) =>
        spawnSync(join(import.meta.dir, "appimage-patchelf.sh"), args, {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${directory}${delimiter}${process.env.PATH}`,
          },
        });
      const agent =
        "/tmp/path with spaces/Lunaris.AppDir/usr/bin/lunaris-agent";
      const preserved = run(["--set-rpath", "$ORIGIN/../lib", agent]);
      expect(preserved.status).toBe(0);
      expect(preserved.stdout).toBe("");
      for (const args of [
        ["--print-rpath", agent],
        [
          "--set-rpath",
          "$ORIGIN/../lib",
          agent.replace("lunaris-agent", "lunaris-desktop"),
        ],
        ["--set-rpath", "$ORIGIN", "/tmp/Lunaris.AppDir/usr/lib/libgtk-3.so"],
        ["--set-rpath", "$ORIGIN", "/tmp/lunaris-agent"],
        ["--version"],
      ]) {
        const delegated = run(args);
        expect(delegated.status).toBe(42);
        expect(delegated.stdout).toBe(`${args.join("\n")}\n`);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
);
