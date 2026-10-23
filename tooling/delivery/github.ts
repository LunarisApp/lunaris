import { git } from "../release/automation/process";

export interface Deployment {
  environment: string;
  id: number;
  payload: unknown;
  sha: string;
}
export interface DeploymentStatus {
  description: string;
  state: string;
}
export async function github<T>(path: string, body?: unknown): Promise<T> {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!(repository && token)) {
    throw new Error("GitHub repository and token required");
  }
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(`GitHub ${path}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
export function verifyTrunk(sha: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Full commit SHA required");
  }
  git("fetch", "origin", "main");
  git("merge-base", "--is-ancestor", sha, "origin/main");
}
export const statuses = (id: number) =>
  github<DeploymentStatus[]>(`deployments/${id}/statuses?per_page=100`);
export async function deployments(environment: string): Promise<Deployment[]> {
  const items: Deployment[] = [];
  for (let page = 1; ; page++) {
    const batch = await github<Deployment[]>(
      `deployments?environment=${encodeURIComponent(environment)}&per_page=100&page=${page}`
    );
    items.push(...batch);
    if (batch.length < 100) {
      return items;
    }
  }
}
export async function lastSuccess(
  environment: string
): Promise<Deployment | undefined> {
  for (const deployment of await deployments(environment)) {
    if ((await statuses(deployment.id))[0]?.state === "success") {
      return deployment;
    }
  }
}
export async function createDeployment(
  environment: string,
  sha: string,
  payload: unknown
) {
  return github<Deployment>("deployments", {
    ref: sha,
    environment,
    auto_merge: false,
    required_contexts: [],
    production_environment: environment.startsWith("production/"),
    transient_environment: false,
    payload,
  });
}
export async function setStatus(
  id: number,
  state: "in_progress" | "success" | "failure" | "error",
  description: string
) {
  return github(`deployments/${id}/statuses`, {
    state,
    description: description.slice(0, 140),
    auto_inactive: false,
    log_url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
}
