const DATABASE_NAME = "lunaris.encryption-keys";
const DATABASE_VERSION = 1;
const STORE_NAME = "keys";

export interface EncryptionKeyVaultRecord {
  id: string;
  key: string;
  updatedAt: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

export async function readEncryptionKeyVaultRecord(
  id: string
): Promise<EncryptionKeyVaultRecord | null> {
  const database = await openKeyVault();
  if (!database) {
    return null;
  }

  const store = database.transaction(STORE_NAME).objectStore(STORE_NAME);
  return (
    ((await requestAsPromise(store.get(id))) as
      | EncryptionKeyVaultRecord
      | undefined) ?? null
  );
}

export async function writeEncryptionKeyVaultRecord(
  record: EncryptionKeyVaultRecord
): Promise<void> {
  const database = await openKeyVault();
  if (!database) {
    return;
  }

  const store = database
    .transaction(STORE_NAME, "readwrite")
    .objectStore(STORE_NAME);
  await requestAsPromise(store.put(record));
}

export async function deleteEncryptionKeyVaultRecord(
  id: string
): Promise<void> {
  const database = await openKeyVault();
  if (!database) {
    return;
  }

  const store = database
    .transaction(STORE_NAME, "readwrite")
    .objectStore(STORE_NAME);
  await requestAsPromise(store.delete(id));
}

export async function clearEncryptionKeyVault(): Promise<void> {
  const database = await openKeyVault();
  if (!database) {
    return;
  }

  const store = database
    .transaction(STORE_NAME, "readwrite")
    .objectStore(STORE_NAME);
  await requestAsPromise(store.clear());
}

async function openKeyVault(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  try {
    return await databasePromise;
  } catch (error) {
    databasePromise = null;
    throw error;
  }
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
