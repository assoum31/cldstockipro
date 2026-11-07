"use client";

// Queue IndexedDB minimale (API native, pas de dépendance) pour les
// comptages qui échouent faute de réseau pendant un scan en entrepôt.
// Chaque entrée garde tout ce qu'il faut pour rejouer submitCount()
// plus tard, sans dépendre d'un état React qui aurait disparu.

const DB_NAME = "stockipro-offline";
const STORE_NAME = "pending_counts";
const DB_VERSION = 1;

export type PendingCount = {
  localId: string;
  queuedAt: string;
  payload: {
    mode: "create" | "update";
    logId?: string;
    sessionId: string;
    productId: string | null;
    barcode: string;
    productName: string;
    countedQuantity: number;
    location: string;
  };
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "localId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueuePendingCount(
  payload: PendingCount["payload"]
): Promise<PendingCount> {
  const entry: PendingCount = {
    localId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    payload,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return entry;
}

export async function getAllPendingCounts(): Promise<PendingCount[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as PendingCount[]);
    request.onerror = () => reject(request.error);
  });
}

export async function removePendingCount(localId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Une erreur de soumission peut être une vraie erreur métier (RLS,
// validation) ou juste "pas de réseau". On ne met en queue QUE le
// second cas : mettre en queue une erreur métier ferait boucler
// indéfiniment sur un envoi qui échouera toujours.
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /fetch|network/i.test(error.message)
  );
}
