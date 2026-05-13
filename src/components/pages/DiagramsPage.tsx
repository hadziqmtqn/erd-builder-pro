/**
 * DiagramsPage — effects moved to useDiagramNavigation hook (Nov 2026).
 *
 * This component is preserved as a thin re-export for backward compatibility.
 * All diagram-specific side effects (URL routing, view cleanup, loaded tracking)
 * now live in hooks/useDiagramNavigation.ts.
 *
 * If no external references remain, this file can be safely deleted.
 */
export { useDiagramNavigation as default } from '../../hooks/useDiagramNavigation';
