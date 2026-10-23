import { z } from "zod";

export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const imageSchema = z
  .object({
    sha: shaSchema,
    image: z.string().regex(/^ghcr\.io\/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$/),
  })
  .strict();
export const candidateSchema = z
  .object({
    schemaVersion: z.literal(1),
    sha: shaSchema,
    runId: z.string().regex(/^\d+$/),
    api: imageSchema,
    web: imageSchema,
    syncRevision: z.string().regex(/^[a-f0-9]{64}$/),
    configurationRevision: z.string().min(1),
  })
  .strict();
export type Candidate = z.infer<typeof candidateSchema>;
export type CoreTarget = "api" | "web" | "core";

export function resultingCandidate(
  candidate: Candidate,
  current: Candidate | undefined,
  target: CoreTarget
): Candidate {
  if (target === "core") {
    return candidate;
  }
  if (!current) {
    throw new Error("Initial production deployment must promote core");
  }
  if (current.configurationRevision !== candidate.configurationRevision) {
    throw new Error("Configuration revision changed; promote core");
  }
  if (target === "web") {
    if (
      current.api.image !== candidate.api.image ||
      current.syncRevision !== candidate.syncRevision
    ) {
      throw new Error(
        "Web candidate requires a different API/sync; promote core"
      );
    }
    return {
      ...candidate,
      api: current.api,
      syncRevision: current.syncRevision,
    };
  }
  if (current.web.image !== candidate.web.image) {
    throw new Error(
      "API candidate was tested with a different web image; promote core"
    );
  }
  return { ...candidate, web: current.web };
}

export function assertCandidateRun(
  candidate: Candidate,
  run: {
    id: number;
    head_sha: string;
    head_branch: string;
    event: string;
    conclusion: string;
    path: string;
  }
) {
  if (
    String(run.id) !== candidate.runId ||
    run.head_sha !== candidate.sha ||
    run.head_branch !== "main" ||
    run.event !== "push" ||
    run.conclusion !== "success" ||
    run.path !== ".github/workflows/core.candidate.yml"
  ) {
    throw new Error(
      "Candidate must come from a successful trunk candidate workflow"
    );
  }
}
