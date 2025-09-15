// Minimal IndexedDB helper to store/retrieve blobs by key
// Namespace: 'pomotoro-media', store: 'media'
export type MediaKey = 'focusSound' | 'waitingVideo';

export interface MediaRecord {
  key: MediaKey;
  name: string; // original filename
  type: string; // mime type
  updatedAt: number;
  blob: Blob;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pomotoro-media', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMedia(key: MediaKey, file: File | Blob, name?: string): Promise<MediaRecord> {
  const db = await openDB();
  const record: Omit<MediaRecord, 'blob'> & { blob: Blob } = {
    key,
    name: name || (file instanceof File ? file.name : key),
    type: file.type || (file instanceof File ? file.type : 'application/octet-stream'),
    updatedAt: Date.now(),
    blob: file,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    const store = tx.objectStore('media');
    const putReq = store.put(record, key);
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
  return record;
}

export async function getMedia(key: MediaKey): Promise<MediaRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readonly');
    const store = tx.objectStore('media');
    const getReq = store.get(key);
    getReq.onsuccess = () => {
      const rec = getReq.result as MediaRecord | undefined;
      resolve(rec || null);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteMedia(key: MediaKey): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    const store = tx.objectStore('media');
    const delReq = store.delete(key);
    delReq.onsuccess = () => resolve();
    delReq.onerror = () => reject(delReq.error);
  });
}
