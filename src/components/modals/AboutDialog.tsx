import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, RefreshCw, CheckCircle2, Download, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

export function AboutDialog({
  open,
  onOpenChange,
  hasUpdate = false,
  latestVersion = null,
  isChecking = false,
  onCheckUpdate = () => {},
  onDownload = () => {},
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasUpdate?: boolean;
  latestVersion?: string | null;
  isChecking?: boolean;
  onCheckUpdate?: () => void;
  onDownload?: () => void;
}) {
  const isTauri = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  const [appVersion, setAppVersion] = useState('...');

  useEffect(() => {
    if (isTauri) {
      import('@tauri-apps/api/app').then(({ getVersion }) =>
        getVersion().then(setAppVersion)
      ).catch(() => setAppVersion('0.0.0'));
    } else {
      // Fallback for browser: try reading from meta or package
      setAppVersion('2.2.1');
    }
  }, [isTauri]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-background border-border/40 shadow-2xl">
        <DialogTitle className="sr-only">About ERD Builder Pro</DialogTitle>
        <DialogDescription className="sr-only">
          Application information and credits.
        </DialogDescription>

        <div className="flex flex-col items-center py-6 gap-4">
          {/* App Icon */}
          <div className="flex items-center justify-center">
            <img
              src="/favicon.svg"
              alt="ERD Builder Pro"
              className="size-14"
            />
          </div>

          {/* App Name + Version */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground">
              ERD Builder Pro
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Version {appVersion}
            </p>
          </div>

          {/* Description */}
          <p className="text-xs text-center text-muted-foreground max-w-[240px] leading-relaxed">
            Entity-Relationship Diagram builder, flowcharts, notes, and AI-powered
            assistance — all in one desktop app.
          </p>

          {/* Check for Updates Section — Tauri only */}
          {isTauri && (
            <div className="w-full">
              <div className="w-full border-t border-border/40 mb-3" />

              {isChecking ? (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Checking for updates...
                </div>
              ) : hasUpdate && latestVersion ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-amber-500">
                    <Download className="size-3.5" />
                    <span>Update <strong>v{latestVersion}</strong> available</span>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={onDownload}
                  >
                    <Download className="size-3.5" />
                    Download Update
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-500">
                    <CheckCircle2 className="size-3.5" />
                    <span>You're up to date</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={onCheckUpdate}
                  >
                    <RefreshCw className="size-3" />
                    Check Again
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="w-full border-t border-border/40" />

          {/* Credits */}
          <div className="text-[10px] text-center text-muted-foreground/60 leading-relaxed">
            <p>Built with React, Tauri, Express &amp; Prisma.</p>
            <p className="mt-0.5">&copy; {new Date().getFullYear()} Bekenweb.</p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                window.open('https://github.com/hadziqmtqn/erd-builder-pro', '_blank');
              }}
            >
              <ExternalLink className="size-3" />
              GitHub
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
