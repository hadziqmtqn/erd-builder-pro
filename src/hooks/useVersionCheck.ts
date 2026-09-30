import { useEffect, useState, useCallback, useRef } from 'react';

const CACHE_KEY = 'erd-version-check';
const CURRENT_CACHE_KEY = 'erd-version-current';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in localStorage

interface VersionCache {
  latest: string;
  current: string;
  fetchedAt: number;
}

function compareNumericIdentifiers(left: string, right: string): number {
  const a = left.replace(/^0+(?=\d)/, '');
  const b = right.replace(/^0+(?=\d)/, '');
  return a.length === b.length ? a.localeCompare(b) : a.length - b.length;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (version: string) => {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    if (!match) return null;
    const prerelease = match[4]?.split('.') ?? [];
    if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return null;
    return { core: match.slice(1, 4), prerelease };
  };

  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;

  for (let i = 0; i < 3; i++) {
    const result = compareNumericIdentifiers(a.core[i], b.core[i]);
    if (result !== 0) return result > 0;
  }
  if (!a.prerelease.length || !b.prerelease.length) return !a.prerelease.length && !!b.prerelease.length;

  for (let i = 0; i < Math.min(a.prerelease.length, b.prerelease.length); i++) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === right) continue;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return compareNumericIdentifiers(left, right) > 0;
    if (leftNumeric !== rightNumeric) return !leftNumeric;
    return left > right;
  }
  return a.prerelease.length > b.prerelease.length;
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
      if (isNewerVersion(cached.latest, runtimeVersion)) {
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

      if (isNewerVersion(latest, runtimeVersion)) {
        setIsOutdated(true);
        setLatestVersion(latest);
      }
    } catch {
      // Network error — use whatever cache we have (even stale)
      const stale = getCachedVersion();
      if (stale && isNewerVersion(stale.latest, runtimeVersion)) {
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
