import { useEffect } from 'react';

const STORAGE_KEY = 'tauri_window_state';

/**
 * Persists Tauri window size/position/maximized state to localStorage
 * and restores it on app launch. Desktop-only; no-op on web.
 */
export function useTauriWindowPersistence() {
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' &&
      !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
    if (!isTauri) return;

    let unlistenFns: (() => void)[] = [];
    let mounted = true;

    async function init() {
      const { getCurrentWindow, PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      // ── Restore saved size/position ──
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const state = JSON.parse(saved);

          if (state.width != null && state.height != null) {
            await appWindow.setSize(new PhysicalSize(state.width, state.height));
          }
          if (state.x != null && state.y != null) {
            await appWindow.setPosition(new PhysicalPosition(state.x, state.y));
          }
          if (state.maximized) {
            await appWindow.toggleMaximize();
          }
        }
      } catch {
        // Ignore corrupt saved state
      }

      if (!mounted) return;

      // ── Save state on resize ──
      const saveSize = appWindow.onResized?.(({ payload }) => {
        try {
          const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          existing.width = payload.width;
          existing.height = payload.height;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
        } catch { /* ignore */ }
      });
      if (saveSize) {
        saveSize.then((fn: any) => unlistenFns.push(fn));
      }

      // ── Save state on move ──
      const savePos = appWindow.onMoved?.(({ payload }) => {
        try {
          const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          existing.x = payload.x;
          existing.y = payload.y;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
        } catch { /* ignore */ }
      });
      if (savePos) {
        savePos.then((fn: any) => unlistenFns.push(fn));
      }

    }

    init();

    return () => {
      mounted = false;
      unlistenFns.forEach((fn) => fn());
    };
  }, []);
}