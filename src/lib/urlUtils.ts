/**
 * URL utilities for the ERD Builder Pro app.
 * Centralizes route matching logic used across multiple files.
 */

/** Share route info extracted from URL path */
interface SharePathInfo {
  type: string;
  uid: string;
}

/**
 * Check if the current URL matches a share/view route pattern.
 * Returns null for regular routes, or { type, uid } for share routes.
 */
export function getSharePathInfo(): SharePathInfo | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const match = path.match(/^\/(view|share)\/(diagram|note|drawing|flowchart|erd|notes|drawings)\/([^/]+)/);
  if (match) {
    const typeMap: Record<string, string> = {
      diagram: 'erd',
      erd: 'erd',
      note: 'notes',
      notes: 'notes',
      drawing: 'drawings',
      drawings: 'drawings',
      flowchart: 'flowchart',
    };
    return { type: typeMap[match[2]] || match[2], uid: match[3] };
  }
  return null;
}

/**
 * Open external URL — works in both browser and Tauri desktop mode.
 * Tauri blocks window.open(), use @tauri-apps/plugin-opener when available.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const isTauri = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  if (isTauri) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
