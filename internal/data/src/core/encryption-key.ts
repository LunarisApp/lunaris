import { createEvlogError } from "evlog";
import {
  clearEncryptionKeyVault,
  deleteEncryptionKeyVaultRecord,
  readEncryptionKeyVaultRecord,
  writeEncryptionKeyVaultRecord,
} from "./key-vault";

const ENCRYPTION_KEY_PATH = "/v1/client/encryption-key";
const USER_ID_HASH_CHARS = 16;
const VALID_KEY = /^[0-9a-f]{64}$/i;

export interface EncryptionKeyScope {
  backendUrl: string;
  regionId: string;
  sessionId: string;
  userId: string;
}

export interface ResolvedEncryptionKey {
  cacheId: string;
  key: string;
  source: "memory" | "persistent" | "network";
}

interface EncryptionKeyLease {
  cacheGeneration?: number;
  cacheId?: string;
  globalGeneration: number;
  scopeGeneration?: number;
  scopeId?: string;
}

interface CachedEncryptionKey {
  key: string;
  lease: EncryptionKeyLease;
}

interface InflightEncryptionKey {
  lease: EncryptionKeyLease;
  promise: Promise<string>;
}

const memoryKeys = new Map<string, CachedEncryptionKey>();
const inflightFetches = new Map<string, InflightEncryptionKey>();
const resolvedKeyLeases = new WeakMap<object, EncryptionKeyLease>();
const scopeGenerations = new Map<string, number>();
const cacheGenerations = new Map<string, number>();
let globalGeneration = 0;
let vaultMutationQueue: Promise<void> = Promise.resolve();

class EncryptionKeyCacheInvalidatedError extends Error {
  constructor() {
    super("Encryption key cache invalidated");
    this.name = "EncryptionKeyCacheInvalidatedError";
  }
}

export class OfflineEncryptionKeyError extends Error {
  override readonly cause: unknown;

  constructor(cause?: unknown) {
    super(
      "Reconnect once to unlock local data on this device. Nothing was deleted."
    );
    this.name = "OfflineEncryptionKeyError";
    this.cause = cause;
  }
}

export function isOfflineEncryptionKeyError(
  error: unknown
): error is OfflineEncryptionKeyError {
  return error instanceof OfflineEncryptionKeyError;
}

export function isOfflineNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

export async function resolveEncryptionKey(
  scope: EncryptionKeyScope
): Promise<ResolvedEncryptionKey> {
  const scopeLease = captureScopeLease(scope);
  const cacheId = await createEncryptionKeyCacheId(scope);
  assertLeaseIsValid(scopeLease);

  const memoryKey = readMemoryKey(cacheId);
  if (memoryKey) {
    return createResolvedEncryptionKey({
      cacheId,
      key: memoryKey,
      lease: bindCacheLease(scopeLease, cacheId),
      source: "memory",
    });
  }

  await waitForVaultMutations();
  assertLeaseIsValid(scopeLease);
  const lease = bindCacheLease(scopeLease, cacheId);
  const storedKey = await readStoredEncryptionKey(cacheId);
  assertLeaseIsValid(lease);
  if (storedKey) {
    memoryKeys.set(cacheId, { key: storedKey, lease });
    return createResolvedEncryptionKey({
      cacheId,
      key: storedKey,
      lease,
      source: "persistent",
    });
  }

  const keyLoadedWhileReadingStorage = readMemoryKey(cacheId);
  if (keyLoadedWhileReadingStorage) {
    return createResolvedEncryptionKey({
      cacheId,
      key: keyLoadedWhileReadingStorage,
      lease,
      source: "memory",
    });
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new OfflineEncryptionKeyError();
  }

  try {
    const key = await fetchEncryptionKey(scope, cacheId, lease);
    assertLeaseIsValid(lease);
    return createResolvedEncryptionKey({
      cacheId,
      key,
      lease,
      source: "network",
    });
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      throw new OfflineEncryptionKeyError(error);
    }
    throw error;
  }
}

export async function refreshEncryptionKey(
  scope: EncryptionKeyScope
): Promise<ResolvedEncryptionKey> {
  const scopeLease = captureScopeLease(scope);
  const cacheId = await createEncryptionKeyCacheId(scope);
  assertLeaseIsValid(scopeLease);
  await waitForVaultMutations();
  assertLeaseIsValid(scopeLease);
  const lease = bindCacheLease(scopeLease, cacheId);
  const key = await fetchEncryptionKey(scope, cacheId, lease);
  assertLeaseIsValid(lease);
  return createResolvedEncryptionKey({
    cacheId,
    key,
    lease,
    source: "network",
  });
}

export async function persistEncryptionKey(
  resolved: Pick<ResolvedEncryptionKey, "cacheId" | "key">
): Promise<void> {
  if (!VALID_KEY.test(resolved.key)) {
    throw new Error("Refusing to persist malformed encryption key");
  }
  const lease =
    resolvedKeyLeases.get(resolved) ?? captureCacheLease(resolved.cacheId);
  if (!isLeaseValid(lease)) {
    return;
  }

  await enqueueVaultMutation(async () => {
    if (!isLeaseValid(lease)) {
      return;
    }
    memoryKeys.set(resolved.cacheId, { key: resolved.key, lease });
    await writeEncryptionKeyVaultRecord({
      id: resolved.cacheId,
      key: resolved.key,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function deleteEncryptionKey(
  scope: EncryptionKeyScope
): Promise<void> {
  invalidateScope(scope);
  await enqueueVaultMutation(async () => {
    const cacheId = await createEncryptionKeyCacheId(scope);
    incrementGeneration(cacheGenerations, cacheId);
    memoryKeys.delete(cacheId);
    inflightFetches.delete(cacheId);
    await deleteEncryptionKeyVaultRecord(cacheId);
  });
}

export async function clearEncryptionKeyCache(): Promise<void> {
  clearEncryptionKeyMemory();
  await enqueueVaultMutation(clearEncryptionKeyVault);
}

export function clearEncryptionKeyMemory(): void {
  globalGeneration += 1;
  scopeGenerations.clear();
  cacheGenerations.clear();
  memoryKeys.clear();
  inflightFetches.clear();
}

async function fetchEncryptionKey(
  scope: EncryptionKeyScope,
  cacheId: string,
  lease: EncryptionKeyLease
): Promise<string> {
  const inflight = inflightFetches.get(cacheId);
  if (inflight && isLeaseValid(inflight.lease)) {
    return inflight.promise;
  }
  if (inflight) {
    inflightFetches.delete(cacheId);
  }

  const pending = (async () => {
    assertLeaseIsValid(lease);
    const response = await fetch(`${scope.backendUrl}${ENCRYPTION_KEY_PATH}`, {
      credentials: "include",
    });
    assertLeaseIsValid(lease);
    if (!response.ok) {
      throw createEvlogError({
        message: "Encryption key fetch failed",
        why: `Server returned ${response.status}`,
      });
    }
    const body = (await response.json()) as { key?: unknown };
    if (typeof body.key !== "string" || !VALID_KEY.test(body.key)) {
      throw createEvlogError({
        message: "Encryption key fetch failed",
        why: "Server returned malformed key payload",
      });
    }
    assertLeaseIsValid(lease);
    memoryKeys.set(cacheId, { key: body.key, lease });
    return body.key;
  })();

  const entry = { lease, promise: pending };
  inflightFetches.set(cacheId, entry);
  try {
    return await pending;
  } finally {
    if (inflightFetches.get(cacheId) === entry) {
      inflightFetches.delete(cacheId);
    }
  }
}

async function readStoredEncryptionKey(
  cacheId: string
): Promise<string | null> {
  const record = await readEncryptionKeyVaultRecord(cacheId);
  if (!record) {
    return null;
  }
  if (record.id === cacheId && VALID_KEY.test(record.key)) {
    return record.key;
  }

  await enqueueVaultMutation(() => deleteEncryptionKeyVaultRecord(cacheId));
  return null;
}

function createResolvedEncryptionKey({
  cacheId,
  key,
  lease,
  source,
}: ResolvedEncryptionKey & { lease: EncryptionKeyLease }) {
  const resolved: ResolvedEncryptionKey = { cacheId, key, source };
  resolvedKeyLeases.set(resolved, lease);
  return resolved;
}

function readMemoryKey(cacheId: string): string | null {
  const cached = memoryKeys.get(cacheId);
  if (!cached) {
    return null;
  }
  if (isLeaseValid(cached.lease)) {
    return cached.key;
  }
  if (memoryKeys.get(cacheId) === cached) {
    memoryKeys.delete(cacheId);
  }
  return null;
}

function captureScopeLease(scope: EncryptionKeyScope): EncryptionKeyLease {
  const scopeId = createEncryptionKeyScopeId(scope);
  return {
    globalGeneration,
    scopeGeneration: scopeGenerations.get(scopeId) ?? 0,
    scopeId,
  };
}

function captureCacheLease(cacheId: string): EncryptionKeyLease {
  return {
    cacheGeneration: cacheGenerations.get(cacheId) ?? 0,
    cacheId,
    globalGeneration,
  };
}

function bindCacheLease(
  lease: EncryptionKeyLease,
  cacheId: string
): EncryptionKeyLease {
  return {
    ...lease,
    cacheGeneration: cacheGenerations.get(cacheId) ?? 0,
    cacheId,
  };
}

function isLeaseValid(lease: EncryptionKeyLease): boolean {
  if (lease.globalGeneration !== globalGeneration) {
    return false;
  }
  if (
    lease.scopeId !== undefined &&
    lease.scopeGeneration !== (scopeGenerations.get(lease.scopeId) ?? 0)
  ) {
    return false;
  }
  return (
    lease.cacheId === undefined ||
    lease.cacheGeneration === (cacheGenerations.get(lease.cacheId) ?? 0)
  );
}

function assertLeaseIsValid(lease: EncryptionKeyLease): void {
  if (!isLeaseValid(lease)) {
    throw new EncryptionKeyCacheInvalidatedError();
  }
}

function invalidateScope(scope: EncryptionKeyScope): void {
  incrementGeneration(scopeGenerations, createEncryptionKeyScopeId(scope));
}

function incrementGeneration(generations: Map<string, number>, id: string) {
  generations.set(id, (generations.get(id) ?? 0) + 1);
}

function enqueueVaultMutation(operation: () => Promise<void>): Promise<void> {
  const result = vaultMutationQueue.then(operation, operation);
  vaultMutationQueue = result.catch(() => undefined);
  return result;
}

async function waitForVaultMutations(): Promise<void> {
  await vaultMutationQueue;
}

function createEncryptionKeyScopeId(scope: EncryptionKeyScope): string {
  return `${scope.regionId}\u0000${scope.userId}\u0000${scope.sessionId}`;
}

async function createEncryptionKeyCacheId(
  scope: EncryptionKeyScope
): Promise<string> {
  return hashValue(createEncryptionKeyScopeId(scope));
}

/** Stable user hash used to scope the local PowerSync filename. */
export async function hashUserId(userId: string): Promise<string> {
  return (await hashValue(userId)).slice(0, USER_ID_HASH_CHARS);
}

async function hashValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}
