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
