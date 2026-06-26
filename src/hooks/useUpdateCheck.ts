import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { check } from '@tauri-apps/plugin-updater';

const DISMISS_KEY = 'erd-update-dismissed-version';

export function useUpdateCheck(onUpdateAvailable?: () => void, skipAutoCheck?: boolean, skipEvent?: boolean) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [update, setUpdate] = useState<any>(null);

  // Use ref for onUpdateAvailable to avoid re-creating performCheck on every render
  const onUpdateAvailableRef = useRef(onUpdateAvailable);
  onUpdateAvailableRef.current = onUpdateAvailable;

  // Guard: prevent concurrent checks (manual or auto)
  const checkingRef = useRef(false);

  // Guard: avoid duplicate auto-check toasts if the same version was already seen
  const toastShownForVersion = useRef<string | null>(null);

  const markVersionSeen = useCallback((version: string) => {
    toastShownForVersion.current = version;
  }, []);

  const isVersionDismissed = useCallback((version: string) => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DISMISS_KEY) === version;
  }, []);

  const dismissVersion = useCallback((version: string) => {
    localStorage.setItem(DISMISS_KEY, version);
  }, []);

  const performCheck = useCallback(async (isManual = false) => {
    // Only run in Tauri environment
    const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
    if (!isTauri) return false;

    // Guard: prevent concurrent checks
    if (checkingRef.current) return false;
    checkingRef.current = true;

    setIsChecking(true);

    // Get current app version dynamically
    let currentVersion = '';
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      currentVersion = await getVersion();
    } catch {
      currentVersion = '0.0.0';
    }

    let toastId: string | number | undefined;
    if (isManual) {
      toastId = toast.loading('Checking for updates...', {
        description: `ERD Builder Pro v${currentVersion}`,
      });
    }

    try {
      const result = await check();

      if (result) {
        setHasUpdate(true);
        setLatestVersion(result.version);
        setUpdate(result);

        if (toastId) toast.dismiss(toastId);

        // Auto-check: don't spam — show once per version, respect dismiss
        if (!isManual) {
          if (toastShownForVersion.current === result.version) return true;
          if (isVersionDismissed(result.version)) return true;
          toastShownForVersion.current = result.version;
        }

        toast.info('Update Available', {
          description: `New version (v${result.version}) is ready.`,
          duration: Infinity,
          action: {
            label: 'Update Now',
            onClick: () => handleDownloadUpdate(result),
          },
          cancel: {
            label: 'Later',
            onClick: () => dismissVersion(result.version),
          },
        });
        onUpdateAvailableRef.current?.();
        return true;
      } else {
        setHasUpdate(false);
        setLatestVersion(null);
        setUpdate(null);
        if (toastId) toast.dismiss(toastId);
        if (isManual) {
          toast.success("You're up to date", {
            description: `ERD Builder Pro v${currentVersion} is the latest version.`,
          });
        }
        return false;
      }
    } catch (error) {
      console.error('Update check failed:', error);
      if (toastId) toast.dismiss(toastId);
      if (isManual) {
        toast.error('Check failed', {
          description: 'Could not check for updates. Check your internet connection.',
        });
      }
      return false;
    } finally {
      setIsChecking(false);
      checkingRef.current = false;
    }
  }, [isVersionDismissed]); // stable — only depends on stable functions

  const handleDownloadUpdate = useCallback(async (u: any) => {
    if (isDownloading) return;

    setIsDownloading(true);
    const toastId = toast.loading('Mengunduh pembaruan...', {
      description: 'Mohon tunggu, sedang mengunduh versi terbaru.',
    });

    try {
      let downloaded = 0;
      let contentLength = 0;

      await u.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            toast.loading('Mengunduh pembaruan...', {
              id: toastId,
              description: `0% - ${formatBytes(contentLength)}`,
            });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const percent = Math.round((downloaded / contentLength) * 100);
            toast.loading(`Mengunduh pembaruan... ${percent}%`, {
              id: toastId,
              description: `${formatBytes(downloaded)} / ${formatBytes(contentLength)}`,
            });
            break;
          case 'Finished':
            toast.success('Pembaruan berhasil diunduh!', {
              id: toastId,
              description: 'Silakan restart aplikasi untuk menerapkan pembaruan.',
              duration: Infinity,
              action: {
                label: 'Tutup Aplikasi',
                onClick: () => {
                  const tauriApi = (window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__;
                  if (tauriApi?.app?.exit) tauriApi.app.exit();
                },
              },
            });
            break;
        }
      });

      setIsDownloading(false);
    } catch (error: any) {
      // Extract the real error message — the updater plugin may throw
      // strings, raw objects, or Error instances with varying shapes.
      const detail =
        typeof error === 'string'
          ? error
          : error?.message
            ? error.message
            : error?.toString
              ? error.toString()
              : JSON.stringify(error);
      console.error('Update download/install failed:', error);
      toast.error('Update failed', {
        id: toastId,
        description: detail || 'An error occurred while downloading the update.',
        duration: 12000,
        action: {
          label: 'Copy Error',
          onClick: () => navigator.clipboard.writeText(detail).catch(() => {}),
        },
      });
      setIsDownloading(false);
    }
  }, [isDownloading]);

  const handleDownload = useCallback(() => {
    if (update) handleDownloadUpdate(update);
  }, [update, handleDownloadUpdate]);

  // Stable refs for checkNow to avoid re-triggering effects
  const performCheckRef = useRef(performCheck);
  performCheckRef.current = performCheck;

  const checkNow = useCallback(() => {
    performCheckRef.current(true);
  }, []);

  // Auto-check 5 seconds after mount (once)
  useEffect(() => {
    if (skipAutoCheck) return;
    const timer = setTimeout(() => performCheckRef.current(false), 5000);
    return () => clearTimeout(timer);
  }, [skipAutoCheck]); // stable — only depends on skipAutoCheck

  // Listen for menu-check-update event (from macOS menu / App.tsx)
  useEffect(() => {
    if (skipEvent) return;
    const handler = () => performCheckRef.current(true);
    window.addEventListener('menu-check-update', handler);
    return () => window.removeEventListener('menu-check-update', handler);
  }, [skipEvent]); // stable — only depends on skipEvent

  return { hasUpdate, latestVersion, isChecking, isDownloading, checkNow, handleDownload };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
