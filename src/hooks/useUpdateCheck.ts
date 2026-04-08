import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import pkg from '../../package.json';

const GITHUB_REPO = 'hadziqmtqn/erd-builder-pro';
const CURRENT_VERSION = pkg.version;

export function useUpdateCheck() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    // Only check in production or if needed
    const checkUpdate = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!response.ok) return;

        const data = await response.json();
        const newestVersion = data.tag_name.replace('v', '');

        // Simple version comparison (e.g. 1.0.1 vs 1.0.0)
        // For a more robust check, you'd use a library like semver
        if (newestVersion !== CURRENT_VERSION && isVersionNewer(newestVersion, CURRENT_VERSION)) {
          setHasUpdate(true);
          setLatestVersion(newestVersion);

          toast.info('Update Available', {
            description: `A new version (v${newestVersion}) of ERD Builder Pro is available. Please update your deployment for the latest features.`,
            duration: 10000,
            action: {
              label: 'View Release',
              onClick: () => window.open(data.html_url, '_blank')
            },
          });
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    // Delay check slightly to not interfere with initial load
    const timer = setTimeout(checkUpdate, 5000);
    return () => clearTimeout(timer);
  }, []);

  return { hasUpdate, latestVersion };
}

function isVersionNewer(newV: string, currentV: string) {
  const n = newV.split('.').map(Number);
  const c = currentV.split('.').map(Number);
  
  for (let i = 0; i < Math.max(n.length, c.length); i++) {
    const nv = n[i] || 0;
    const cv = c[i] || 0;
    if (nv > cv) return true;
    if (nv < cv) return false;
  }
  return false;
}
