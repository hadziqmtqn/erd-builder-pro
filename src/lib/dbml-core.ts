import { useEffect, useState } from 'react';

type DbmlCore = typeof import('@dbml/core');

let loaded: DbmlCore | null = null;
let pending: Promise<DbmlCore> | null = null;

/** @dbml/core is about 15 MB, so it loads on first ERD use instead of with the app shell (BUG-032). */
export function loadDbmlCore(): Promise<DbmlCore> {
  pending ??= import('@dbml/core').then(
    (module) => (loaded = module),
    (error) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

export const isDbmlCoreLoaded = () => loaded !== null;

/**
 * Starts loading the parser once the page is idle (at the latest after 3 s). Compiling 15 MB blocks the main
 * thread, so an ERD canvas is drawn first instead of waiting behind it (BUG-053).
 */
export function preloadDbmlCore(): void {
  const load = () => { void loadDbmlCore().catch(() => {}); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(load, { timeout: 3000 });
  else window.setTimeout(load, 1000);
}

/**
 * Sync access for callers that run after `loadDbmlCore()` resolved. The DB Client route awaits it before rendering;
 * the ERD canvas does not (BUG-053), so ERD code that parses DBML waits for it first.
 */
export function dbmlCore(): DbmlCore {
  if (loaded) return loaded;
  void loadDbmlCore();
  throw new Error('The DBML parser is still loading. Try again in a moment.');
}

/** Re-renders once the parser is ready, for components that parse DBML while rendering. */
export function useDbmlCoreReady(enabled = true): boolean {
  const [isReady, setIsReady] = useState(isDbmlCoreLoaded);
  useEffect(() => {
    if (!enabled || isReady) return;
    let cancelled = false;
    void loadDbmlCore().then(() => { if (!cancelled) setIsReady(true); }, () => {});
    return () => { cancelled = true; };
  }, [enabled, isReady]);
  return isReady;
}
