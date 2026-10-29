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

/** Sync access for callers that run after `loadDbmlCore()` resolved (ERD routes await it before rendering). */
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
