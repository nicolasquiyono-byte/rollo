import { openDB, type IDBPDatabase } from 'idb';
import type { QueuedPhoto } from '@/types';

const DB_NAME = 'rollo-offline';
const STORE = 'pending-photos';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueuePhoto(photo: QueuedPhoto): Promise<void> {
  const db = await getDb();
  await db.put(STORE, photo);
}

export async function listPending(rolloId?: string): Promise<QueuedPhoto[]> {
  const db = await getDb();
  const all = (await db.getAll(STORE)) as QueuedPhoto[];
  return rolloId ? all.filter((p) => p.rollo_id === rolloId) : all;
}

export async function removePending(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function pendingCount(rolloId?: string): Promise<number> {
  return (await listPending(rolloId)).length;
}
