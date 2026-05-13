const CACHE_KEY = 'hermes:note-titles';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Separate cache for full note content (stale-while-revalidate)
const CONTENT_CACHE_KEY = 'hermes:note-content';
const CONTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  title: string;
  projectName?: string;
  updatedAt: number;
}

interface ContentCacheEntry {
  title: string;
  content: string;
  updatedAt: number;
}

interface ContentCacheStore {
  [uid: string]: ContentCacheEntry;
}

interface CacheStore {
  [uid: string]: CacheEntry;
}

function readCache(): CacheStore {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeCache(store: CacheStore): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function saveTitleCache(uid: string, title: string, projectName?: string): void {
  const store = readCache();
  store[uid] = { title, projectName, updatedAt: Date.now() };
  writeCache(store);
}

export function getTitleCache(uid: string): CacheEntry | null {
  const store = readCache();
  const entry = store[uid];
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > MAX_AGE_MS) {
    // Purge stale entry
    delete store[uid];
    writeCache(store);
    return null;
  }
  return entry;
}

export function clearTitleCache(uid?: string): void {
  if (uid) {
    const store = readCache();
    delete store[uid];
    writeCache(store);
  } else {
    localStorage.removeItem(CACHE_KEY);
  }
}

// ─── Content cache (stale-while-revalidate) ──────────────────

function readContentCache(): ContentCacheStore {
  try {
    const raw = localStorage.getItem(CONTENT_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeContentCache(store: ContentCacheStore): void {
  try {
    localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full — silently ignore
  }
}

export function saveContentCache(uid: string, title: string, content: string): void {
  const store = readContentCache();
  store[uid] = { title, content, updatedAt: Date.now() };
  writeContentCache(store);
}

export function getContentCache(uid: string): ContentCacheEntry | null {
  const store = readContentCache();
  const entry = store[uid];
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > CONTENT_MAX_AGE_MS) {
    delete store[uid];
    writeContentCache(store);
    return null;
  }
  return entry;
}

export function clearContentCache(uid?: string): void {
  if (uid) {
    const store = readContentCache();
    delete store[uid];
    writeContentCache(store);
  } else {
    localStorage.removeItem(CONTENT_CACHE_KEY);
  }
}
