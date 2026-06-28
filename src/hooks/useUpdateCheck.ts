import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { check } from '@tauri-apps/plugin-updater';

const DISMISS_KEY = 'erd-update-dismissed-version';
const NOTIFIED_KEY = 'erd-update-notified-version';

/** Write a diagnostic message to the app's server log. */
async function updateLog(level: string, message: string, extra?: string) {
  try {
    await fetch('http://localhost:3099/api/log/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, extra, timestamp: new Date().toISOString() }),
    });
  } catch {
    // Log endpoint may not exist — silently ignore.
  }
}

export function useUpdateCheck(onUpdateAvailable?: () => void, skipAutoCheck?: boolean, skipEvent?: boolean) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [update, setUpdate] = useState<any>(null);

  const onUpdateAvailableRef = useRef(onUpdateAvailable);
  onUpdateAvailableRef.current = onUpdateAvailable;
  const checkingRef = useRef(false);
  const toastShownForVersion = useRef<string | null>(null);
  const downloadingRef = useRef(false);

  const dismissVersion = useCallback((version: string) => { localStorage.setItem(DISMISS_KEY, version); }, []);
  const isVersionDismissed = useCallback((version: string) => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DISMISS_KEY) === version;
  }, []);

  const handleDownloadUpdate = useCallback(async (u: any) => {
    updateLog('debug', 'handleDownloadUpdate called', `downloadingRef=${downloadingRef.current} version=${u.version}`);
    if (downloadingRef.current) {
      updateLog('debug', 'BLOCKED: download already in progress');
      return;
    }
    downloadingRef.current = true;
    setIsDownloading(true);
    updateLog('info', 'download STARTED');
    const toastId = toast.loading('Downloading update...', { description: 'Please wait, downloading the latest version.' });
    updateLog('info', 'download_started', u.version);
    try {
      let downloaded = 0, contentLength = 0;
      await u.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            updateLog('info', 'download_progress', `0% of ${formatBytes(contentLength)}`);
            toast.loading('Downloading update...', { id: toastId, description: `0% - ${formatBytes(contentLength)}` });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const pct = Math.round((downloaded / contentLength) * 100);
            toast.loading(`Downloading update... ${pct}%`, { id: toastId, description: `${formatBytes(downloaded)} / ${formatBytes(contentLength)}` });
            break;
          case 'Finished':
            updateLog('info', 'download_finished', 'ready to install');
            toast.success('Update downloaded successfully!', {
              id: toastId,
              description: 'Please restart the application to apply the update.',
              duration: Infinity,
              action: {
                label: 'Close Application',
                onClick: async () => {
                  updateLog('info', 'exit_requested', 'user clicked close');
                  try {
                    const { exit } = await import('@tauri-apps/plugin-process');
                    updateLog('info', 'exit_calling', '@tauri-apps/plugin-process');
                    await exit(0);
                  } catch (err: any) {
                    updateLog('error', 'exit_failed', err?.message || String(err));
                    window.location.reload();
                  }
                },
              },
            });
            break;
        }
      });
      setIsDownloading(false);
      downloadingRef.current = false;
    } catch (error: any) {
      const detail = typeof error === 'string' ? error : error?.message || error?.toString?.() || JSON.stringify(error);
      updateLog('error', 'download_failed', detail);
      toast.error('Update failed', {
        id: toastId,
        description: detail || 'An error occurred while downloading the update.',
        duration: 12000,
        action: { label: 'Copy Error', onClick: () => navigator.clipboard.writeText(detail).catch(() => {}) },
      });
      setIsDownloading(false);
      downloadingRef.current = false;
    }
  }, []);

  const performCheck = useCallback(async (isManual = false) => {
    updateLog('debug', 'performCheck called', `isManual=${isManual} checkingRef=${checkingRef.current}`);
    const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
    if (!isTauri) { updateLog('debug', 'SKIP: not Tauri'); return false; }
    if (checkingRef.current) { updateLog('debug', 'SKIP: already checking'); return false; }
    checkingRef.current = true;
    setIsChecking(true);

    let currentVersion = '';
    try { const { getVersion } = await import('@tauri-apps/api/app'); currentVersion = await getVersion(); } catch { currentVersion = '0.0.0'; }

    let toastId: string | number | undefined;
    if (isManual) toastId = toast.loading('Checking for updates...', { description: `ERD Builder Pro v${currentVersion}` });

    updateLog('info', 'check_started', `current=${currentVersion} manual=${isManual}`);

    try {
      const result = await check();

      if (result) {
        setHasUpdate(true); setLatestVersion(result.version); setUpdate(result);
        if (toastId) toast.dismiss(toastId);
        if (!isManual && (toastShownForVersion.current === result.version || isVersionDismissed(result.version))) {
          updateLog('debug', 'SKIP toast: already shown/dismissed', result.version);
          setIsChecking(false); checkingRef.current = false; return true;
        }
        toastShownForVersion.current = result.version;
        updateLog('info', 'update_available', `v${result.version}`);
        // If this version was already notified by another instance (e.g., auto-check),
        // skip showing a duplicate toast on manual check
        if (isManual && localStorage.getItem(NOTIFIED_KEY) === result.version) {
          updateLog('debug', 'SKIP toast: already notified by auto-check', result.version);
          setHasUpdate(true); setLatestVersion(result.version); setUpdate(result);
          onUpdateAvailableRef.current?.();
          setIsChecking(false); checkingRef.current = false;
          return true;
        }
        updateLog('debug', 'SHOWING toast: Update Available', `v${result.version} manual=${isManual}`);
        toast.info('Update Available', { description: `New version (v${result.version}) is ready.`, duration: Infinity, action: { label: 'Update Now', onClick: () => handleDownloadUpdate(result) }, cancel: { label: 'Later', onClick: () => dismissVersion(result.version) } });
        if (!isManual) localStorage.setItem(NOTIFIED_KEY, result.version);
        onUpdateAvailableRef.current?.();
        setIsChecking(false); checkingRef.current = false;
        return true;
      }

      // No update available
      if (toastId) toast.dismiss(toastId);
      if (isManual) toast.success("You're up to date", { description: `ERD Builder Pro v${currentVersion} is the latest version.` });
      updateLog('info', 'no_update', `current=${currentVersion}`);
      setHasUpdate(false); setLatestVersion(null); setUpdate(null);
    } catch (err: any) {
      updateLog('error', 'check_failed', err?.message || String(err));
      if (toastId) toast.dismiss(toastId);
      if (isManual) toast.error('Check failed', { description: 'Could not check for updates. Check your internet connection.' });
    }

    setIsChecking(false); checkingRef.current = false;
    return false;
  }, [isVersionDismissed, handleDownloadUpdate]);

  const handleDownload = useCallback(() => {
    updateLog('debug', 'handleDownload called', `update=${update?.version} downloadingRef=${downloadingRef.current}`);
    if (update) handleDownloadUpdate(update);
  }, [update, handleDownloadUpdate]);
  const performCheckRef = useRef(performCheck); performCheckRef.current = performCheck;
  const checkNow = useCallback(() => { updateLog('debug', 'checkNow (manual trigger)'); performCheckRef.current(true); }, []);

  useEffect(() => { if (skipAutoCheck) return; updateLog('debug', 'scheduling auto-check in 5s'); const t = setTimeout(() => { updateLog('debug', 'auto-check timer fired'); performCheckRef.current(false); }, 5000); return () => clearTimeout(t); }, [skipAutoCheck]);
  useEffect(() => { if (skipEvent) return; const h = () => performCheckRef.current(true); window.addEventListener('menu-check-update', h); return () => window.removeEventListener('menu-check-update', h); }, [skipEvent]);

  return { hasUpdate, latestVersion, isChecking, isDownloading, checkNow, handleDownload };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
