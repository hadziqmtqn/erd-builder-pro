import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { check } from '@tauri-apps/plugin-updater';

export function useUpdateCheck() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Only run in Tauri environment
    if (!(window as any).__TAURI__) return;

    const checkUpdate = async () => {
      try {
        const update = await check();
        
        if (update?.available) {
          setHasUpdate(true);
          setLatestVersion(update.version);

          toast.info('Pembaruan Tersedia', {
            description: `Versi baru (v${update.version}) sudah tersedia dengan fitur terbaru.`,
            duration: Infinity, // Don't auto-dismiss
            action: {
              label: 'Update Sekarang',
              onClick: () => handleUpdate(update),
            },
          });
        }
      } catch (error) {
        console.error('Update check failed:', error);
      }
    };

    // Check 5 seconds after app starts
    const timer = setTimeout(checkUpdate, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async (update: any) => {
    if (isDownloading) return;
    
    setIsDownloading(true);
    const toastId = toast.loading('Mengunduh pembaruan...', {
      description: 'Mohon tunggu, sedang mengunduh versi terbaru.',
    });

    try {
      // Download and install update
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event: any) => {
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
                  // User will manually reopen the app
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
  };

  return { hasUpdate, latestVersion, isDownloading };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
