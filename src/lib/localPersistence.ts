/**
 * Local Persistence Utility using Native IndexedDB
 * Handles autosave drafts for ERD, Notes, Flowcharts, and Drawings.
 */

const DB_NAME = 'erd-builder-pro-db';
const STORE_NAME = 'drafts';
const DB_VERSION = 2;

import { DraftType } from '../types';

export interface Draft {
  id: string | number;
  type: DraftType;
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
        // Store for full resources (not just drafts)
        if (!db.objectStoreNames.contains('resources')) {
          const resourceStore = db.createObjectStore('resources', { keyPath: 'id' });
          resourceStore.createIndex('type', 'type', { unique: false });
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

  // --- Draft Management (Existing) ---
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

  // --- Resource Management (New for Guest Mode) ---
  async getAllResources(type: string): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('resources', 'readonly');
      const store = transaction.objectStore('resources');
      const index = store.index('type');
      const request = index.getAll(type);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getResource(id: string | number): Promise<any | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('resources', 'readonly');
      const store = transaction.objectStore('resources');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveResource(resource: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('resources', 'readwrite');
      const store = transaction.objectStore('resources');
      const request = store.put(resource);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteResource(id: string | number): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('resources', 'readwrite');
      const store = transaction.objectStore('resources');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const localPersistence = new LocalPersistence();
