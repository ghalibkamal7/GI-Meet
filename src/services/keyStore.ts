const DB_NAME = 'gi-meet-keys';
const STORE_NAME = 'private-keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePrivateKey(uid: string, key: CryptoKey): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(key, uid);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function savePrivateKeyIfAbsent(uid: string, key: CryptoKey): Promise<CryptoKey> {
  const db = await openDb();
  try {
    return await new Promise<CryptoKey>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let selectedKey: CryptoKey | undefined;
      const read = store.get(uid);
      read.onsuccess = () => {
        if (read.result) {
          selectedKey = read.result as CryptoKey;
          return;
        }
        const write = store.add(key, uid);
        write.onsuccess = () => {
          selectedKey = key;
        };
      };
      read.onerror = () => reject(read.error);
      tx.oncomplete = () => {
        if (selectedKey) resolve(selectedKey);
        else reject(new Error('Private key storage transaction completed without a key.'));
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getPrivateKey(uid: string): Promise<CryptoKey | null> {
  const db = await openDb();
  try {
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(uid);
      request.onsuccess = () => resolve((request.result as CryptoKey) ?? null);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}