import type {
  ResourceEnvelope,
  ResourcePayloadContext,
  ResourceTypeDefinition,
} from "./types";

export interface ResourceVersionCommitter {
  compareAndSet(input: {
    expectedVersion: number;
    nextVersion: number;
    payload: unknown;
    writePayload: () => Promise<void>;
  }): Promise<boolean>;
  readVersion?(): Promise<number | undefined>;
}

export type ResourceResolution =
  | { envelope: ResourceEnvelope; payload: unknown; status: "ready" }
  | {
      diagnostic: string;
      envelope: ResourceEnvelope;
      retryable: boolean;
      status: "quarantined";
    };

async function validate(
  definition: ResourceTypeDefinition,
  version: number,
  payload: unknown
): Promise<unknown> {
  const validator = definition.schema.versions[version];
  if (!validator) {
    throw new Error(`Unsupported schema version ${version}`);
  }
  const result = await validator["~standard"].validate(payload);
  if (result.issues) {
    throw new Error(
      `Schema ${definition.schema.id}@${version} rejected resource payload`
    );
  }
  return result.value;
}

function quarantine(
  envelope: ResourceEnvelope,
  diagnostic: string,
  retryable = true
): ResourceResolution {
  return { diagnostic, envelope, retryable, status: "quarantined" };
}

async function migratePayload(
  definition: ResourceTypeDefinition,
  payload: unknown,
  storedVersion: number
): Promise<unknown> {
  for (
    let version = storedVersion;
    version < definition.schema.currentVersion;
    version += 1
  ) {
    const migration = definition.schema.migrations?.find(
      (candidate) => candidate.from === version && candidate.to === version + 1
    );
    if (!migration) {
      throw new Error(`Missing migration ${version} -> ${version + 1}`);
    }
    payload = await migration.migrate(payload);
    payload = await validate(definition, version + 1, payload);
  }
  return payload;
}

/** Resolves and lazily migrates a resource before any semantic read. */
export async function resolveResource(
  definition: ResourceTypeDefinition,
  envelope: ResourceEnvelope,
  context: ResourcePayloadContext,
  committer: ResourceVersionCommitter
): Promise<ResourceResolution> {
  return resolveResourceAttempt(definition, envelope, context, committer, true);
}

async function resolveResourceAttempt(
  definition: ResourceTypeDefinition,
  envelope: ResourceEnvelope,
  context: ResourcePayloadContext,
  committer: ResourceVersionCommitter,
  canRetry: boolean
): Promise<ResourceResolution> {
  const storedVersion = envelope.schemaVersion;
  const currentVersion = definition.schema.currentVersion;

  if (storedVersion > currentVersion) {
    return quarantine(
      envelope,
      `Resource uses newer schema version ${storedVersion}; this extension supports ${currentVersion}`,
      false
    );
  }

  try {
    let payload = await definition.schema.read(context);
    payload = await validate(definition, storedVersion, payload);
    if (storedVersion === currentVersion) {
      return { envelope, payload, status: "ready" };
    }

    payload = await migratePayload(definition, payload, storedVersion);

    const write = definition.schema.write;
    if (!write) {
      throw new Error("Migrating resource schema has no payload writer");
    }
    const committed = await committer.compareAndSet({
      expectedVersion: storedVersion,
      nextVersion: currentVersion,
      payload,
      writePayload: () => Promise.resolve(write(payload, context)),
    });
    if (!committed) {
      const latestVersion = canRetry
        ? await committer.readVersion?.()
        : undefined;
      if (
        latestVersion !== undefined &&
        latestVersion !== storedVersion &&
        Number.isInteger(latestVersion) &&
        latestVersion > 0
      ) {
        return resolveResourceAttempt(
          definition,
          { ...envelope, schemaVersion: latestVersion },
          context,
          committer,
          false
        );
      }
      return quarantine(
        envelope,
        "Resource changed while its schema was being migrated"
      );
    }

    return {
      envelope: { ...envelope, schemaVersion: currentVersion },
      payload,
      status: "ready",
    };
  } catch (error) {
    return quarantine(
      envelope,
      error instanceof Error ? error.message : "Resource resolution failed"
    );
  }
}
