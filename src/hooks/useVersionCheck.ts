import { useEffect, useState, useCallback, useRef } from 'react';

const CACHE_KEY = 'erd-version-check';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in localStorage

interface VersionCache {
  latest: string;
  current: string;
  fetchedAt: number;
}

function getCurrentVersion(): string {
  try {
    // Built via Vite define — injected at build time
    return (import.meta as any).env?.APP_VERSION || '0.0.0';
  } catch {
    return '0.0.0';
  }
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
 * - Calls GET /api/version/latest (server proxies GitHub API, 1-hour cache)
 * - Falls back to localStorage cache (1-hour TTL)
 * - Works in web, CLI, Docker, and desktop mode
 * - Desktop: Tauri updater hook (useUpdateCheck) handles actual download/install;
 *   this hook only provides the "outdated" flag for the UI badge.
 */
export function useVersionCheck() {
  const [isOutdated, setIsOutdated] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const currentVersion = useRef(getCurrentVersion()).current;
  const hasChecked = useRef(false);

  const checkVersion = useCallback(async () => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    // 1. Try localStorage cache first (instant, no network)
    const cached = getCachedVersion();
    if (cached && cached.current === currentVersion) {
      if (cached.latest !== currentVersion && cached.latest) {
        setIsOutdated(true);
        setLatestVersion(cached.latest);
      }
      return;
    }

    // 2. Fetch from server (which proxies GitHub API)
    try {
      const base = (import.meta as any).env?.VITE_API_URL || '';
      const resp = await fetch(`${base}/api/version/latest`);
      if (!resp.ok) return;

      const data = await resp.json();
      const latest = data?.latest;
      if (!latest) return;

      setCachedVersion(latest, currentVersion);

      if (latest !== currentVersion) {
        setIsOutdated(true);
        setLatestVersion(latest);
      }
    } catch {
      // Network error — use whatever cache we have (even stale)
      const stale = getCachedVersion();
      if (stale && stale.latest !== currentVersion && stale.latest) {
        setIsOutdated(true);
        setLatestVersion(stale.latest);
      }
    }
  }, [currentVersion]);

  useEffect(() => {
    // Auto-check on mount
    checkVersion();
  }, [checkVersion]);

  return { isOutdated, latestVersion, currentVersion, checkNow: checkVersion };
}
