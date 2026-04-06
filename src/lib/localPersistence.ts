/**
 * Local Persistence Utility using Native IndexedDB
 * Handles autosave drafts for ERD, Notes, Flowcharts, and Drawings.
 */

const DB_NAME = 'erd-builder-pro-db';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

export interface Draft {
  id: string | number;
  type: 'erd' | 'notes' | 'flowchart' | 'drawings';
  data: string;
  updated_at: number;
  sync_pending: boolean;
}

class LocalPersistence {
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: ['type', 'id'] });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async saveDraft(type: Draft['type'], id: string | number, data: string, sync_pending = true): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const draft: Draft = {
        id,
        type,
        data,
        updated_at: Date.now(),
        sync_pending,
      };

      const request = store.put(draft);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDraft(type: Draft['type'], id: string | number): Promise<Draft | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get([type, id]);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async clearDraft(type: Draft['type'], id: string | number): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete([type, id]);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPendingSyncs(): Promise<Draft[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as Draft[];
        resolve(all.filter(d => d.sync_pending));
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const localPersistence = new LocalPersistence();
