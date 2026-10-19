import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function run(
  command: string,
  args: string[],
  options: {
    allowFailure?: boolean;
    cwd?: string;
    inheritOutput?: boolean;
  } = {}
) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd,
    stdio: options.inheritOutput ? "inherit" : "pipe",
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stderr}${result.stdout}`
    );
  }
  return {
    ok: result.status === 0,
    text: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}
export function git(...args: string[]) {
  return run("git", args).text;
}
export function output(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}
export function summary(value: string) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${value}\n`);
  }
}
