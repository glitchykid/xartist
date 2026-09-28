function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('xartist', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('recovery');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function recovery(data?: string): Promise<string | undefined> {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('recovery', data === undefined ? 'readonly' : 'readwrite');
      const request =
        data === undefined
          ? tx.objectStore('recovery').get('latest')
          : tx.objectStore('recovery').put(data, 'latest');
      tx.oncomplete = () => resolve(data === undefined ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
