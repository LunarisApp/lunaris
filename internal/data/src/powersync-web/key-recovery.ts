import {
  isOfflineNetworkError,
  OfflineEncryptionKeyError,
  type ResolvedEncryptionKey,
} from "../core/encryption-key";

export async function openDatabaseWithKeyRecovery<T>({
  initialKey,
  isKeyMismatch,
  open,
  refreshKey,
  wipe,
}: {
  initialKey: ResolvedEncryptionKey;
  isKeyMismatch: (error: unknown) => boolean;
  open: (key: string) => Promise<T>;
  refreshKey: () => Promise<ResolvedEncryptionKey>;
  wipe: () => Promise<void>;
}): Promise<{ database: T; key: ResolvedEncryptionKey }> {
  try {
    return { database: await open(initialKey.key), key: initialKey };
  } catch (error) {
    if (!isKeyMismatch(error)) throw error;
  }

  if (initialKey.source === "network") {
    await wipe();
    return { database: await open(initialKey.key), key: initialKey };
  }

  let authoritativeKey: ResolvedEncryptionKey;
  try {
    authoritativeKey = await refreshKey();
  } catch (error) {
    if (isOfflineNetworkError(error)) {
      throw new OfflineEncryptionKeyError(error);
    }
    throw error;
  }

  if (authoritativeKey.key !== initialKey.key) {
    try {
      return {
        database: await open(authoritativeKey.key),
        key: authoritativeKey,
      };
    } catch (error) {
      if (!isKeyMismatch(error)) throw error;
    }
  }

  await wipe();
  return {
    database: await open(authoritativeKey.key),
    key: authoritativeKey,
  };
}
