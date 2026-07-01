import { useEffect, useState, useCallback, useRef } from 'react';

const CACHE_KEY = 'erd-version-check';
const CURRENT_CACHE_KEY = 'erd-version-current';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in localStorage

interface VersionCache {
  latest: string;
  current: string;
  fetchedAt: number;
}

function getBuildVersion(): string {
  try {
    return (import.meta as any).env?.APP_VERSION || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function fetchCurrentVersion(): Promise<string> {
  // Try server endpoint first (returns runtime version for CLI/Docker)
  try {
    const base = (import.meta as any).env?.VITE_API_URL || '';
    const resp = await fetch(`${base}/api/version/current`);
    if (resp.ok) {
      const data = await resp.json();
      const v = data?.current;
      if (v && v !== '0.0.0') {
        localStorage.setItem(CURRENT_CACHE_KEY, v);
        return v;
      }
    }
  } catch {
    // Fall through to build version
  }

  // Short-lived cache in localStorage for non-CLI modes
  const cached = localStorage.getItem(CURRENT_CACHE_KEY);
  if (cached) return cached;

  return getBuildVersion();
}

function getCachedVersion(): VersionCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: VersionCache = JSON.parse(raw);
    if (Date.now() - cache.fetchedAt > CACHE_TTL) return null;
    return cache;
  } catch {
    return null;
  }
}

function setCachedVersion(latest: string, current: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ latest, current, fetchedAt: Date.now() }));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

/**
 * Cross-platform version check hook.
 *
 * - Calls GET /api/version/current for the runtime version (CLI passes APP_VERSION env var).
 * - Calls GET /api/version/latest — server routes CLI→npm, others→GitHub.
 * - Falls back to localStorage cache (1-hour TTL).
 * - Works in web, CLI, Docker, and desktop mode.
 */
export function useVersionCheck() {
  const [isOutdated, setIsOutdated] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>(getBuildVersion());
  const hasChecked = useRef(false);

  const checkVersion = useCallback(async () => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    // 1. Fetch runtime version (non-blocking — use build-time value until resolved)
    const runtimeVersion = await fetchCurrentVersion();
    setCurrentVersion(runtimeVersion);

    // 2. Try localStorage cache first (instant, no network)
    const cached = getCachedVersion();
    if (cached && cached.current === runtimeVersion) {
      if (cached.latest !== runtimeVersion && cached.latest) {
        setIsOutdated(true);
        setLatestVersion(cached.latest);
      }
      return;
    }

    // 3. Fetch latest version from server
    try {
      const base = (import.meta as any).env?.VITE_API_URL || '';
      const resp = await fetch(`${base}/api/version/latest`);
      if (!resp.ok) return;

      const data = await resp.json();
      const latest = data?.latest;
      if (!latest) return;

      setCachedVersion(latest, runtimeVersion);

      if (latest !== runtimeVersion) {
        setIsOutdated(true);
        setLatestVersion(latest);
      }
    } catch {
      // Network error — use whatever cache we have (even stale)
      const stale = getCachedVersion();
      if (stale && stale.latest !== runtimeVersion && stale.latest) {
        setIsOutdated(true);
        setLatestVersion(stale.latest);
      }
    }
  }, []);

  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  return { isOutdated, latestVersion, currentVersion, checkNow: checkVersion };
}
