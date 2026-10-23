import { candidateSchema, type Candidate } from "./candidate";
import { deployments, statuses } from "./github";

export interface CoreState {
  current?: Candidate;
  pending: Candidate[];
}

/** Retain every incomplete composition since the last verified deployment. */
export async function readCoreState(
  environment: "staging" | "production"
): Promise<CoreState> {
  const state: CoreState = { pending: [] };
  for (const record of await deployments(`${environment}/core`)) {
    const candidate = candidateSchema.parse(record.payload);
    if ((await statuses(record.id))[0]?.state === "success") {
      state.current = candidate;
      break;
    }
    state.pending.push(candidate);
  }
  return state;
}

export function needsSyncRecovery(state: CoreState, candidate: Candidate) {
  return state.pending.some(
    (attempt) => attempt.syncRevision !== candidate.syncRevision
  );
}

export function assertRollbackSafe(state: CoreState, candidate: Candidate) {
  if (
    !state.current ||
    candidate.syncRevision !== state.current.syncRevision ||
    candidate.configurationRevision !== state.current.configurationRevision ||
    needsSyncRecovery(state, candidate) ||
    state.pending.some(
      (attempt) =>
        attempt.configurationRevision !== candidate.configurationRevision
    )
  ) {
    throw new Error(
      "Rollback cannot reverse confirmed or unresolved sync/configuration changes; use a forward fix"
    );
  }
}
