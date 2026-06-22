import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { check } from '@tauri-apps/plugin-updater';

export function useUpdateCheck(onUpdateAvailable?: () => void, skipAutoCheck?: boolean) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [update, setUpdate] = useState<any>(null);

  const performCheck = useCallback(async (isManual = false) => {
    // Only run in Tauri environment
    if (!(window as any).__TAURI__) return false;

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
        toast.info('Update Available', {
          description: `New version (v${result.version}) is ready.`,
          duration: Infinity,
          action: {
            label: 'Update Now',
            onClick: () => handleDownloadUpdate(result),
          },
        });
        onUpdateAvailable?.();
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
    }
  }, [onUpdateAvailable]);

  // Auto-check 5 seconds after mount
  useEffect(() => {
    if (skipAutoCheck) return;
    const timer = setTimeout(performCheck, 5000);
    return () => clearTimeout(timer);
  }, [performCheck, skipAutoCheck]);

  // Listen for menu-check-update event (from macOS menu / App.tsx)
  useEffect(() => {
    const handler = () => performCheck(true);
    window.addEventListener('menu-check-update', handler);
    return () => window.removeEventListener('menu-check-update', handler);
  }, [performCheck]);

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
                  (window as any).__TAURI__.app.exit();
                },
              },
            });
            break;
        }
      });

      setIsDownloading(false);
    } catch (error: any) {
      console.error('Update failed:', error);
      toast.error('Pembaruan gagal', {
        id: toastId,
        description: error.message || 'Terjadi kesalahan saat mengunduh pembaruan.',
      });
      setIsDownloading(false);
    }
  }, [isDownloading]);

  const handleDownload = useCallback(() => {
    if (update) handleDownloadUpdate(update);
  }, [update, handleDownloadUpdate]);

  return { hasUpdate, latestVersion, isChecking, isDownloading, checkNow: () => performCheck(true), handleDownload };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
