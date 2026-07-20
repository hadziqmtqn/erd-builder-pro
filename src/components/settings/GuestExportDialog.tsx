/**
 * GuestExportDialog — Dialog for Guest Mode data export/backup
 *
 * Shown when a Guest Mode user clicks "Backup Data" in the sidebar menu.
 * Lets them download all their local IndexedDB data as a .json file.
 */

import { useState } from 'react';
import { Download, Loader2, User, Database, FileJson } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { exportGuestData } from '@/lib/guestExport';
import { toast } from 'sonner';

export function GuestExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportGuestData();
      toast.success('Data exported successfully!');
    } catch (err: any) {
      toast.error('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-105 bg-background border-border/40 shadow-2xl">
        <DialogTitle className="sr-only">Guest Data Backup</DialogTitle>
        <DialogDescription className="sr-only">
          Export your Guest Mode data as a JSON file for safe keeping or future import.
        </DialogDescription>

        <div className="p-2 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl">
              <User className="size-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Guest Mode</h3>
              <p className="text-xs text-muted-foreground">You are browsing as a guest</p>
            </div>
          </div>

          {/* Info card */}
          <div className="bg-muted/10 border border-border/40 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Database className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Your data (notes, diagrams, flowcharts, drawings, and AI chats) is stored
                  locally in your browser. Export it as a <code className="bg-muted px-1 rounded text-[11px]">.json</code>{' '}
                  file so you can import it after signing in.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FileJson className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  The export file can be imported into any ERD Builder Pro account via
                  <strong> Settings → Guest Data Import</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Export button */}
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full"
          >
            {isExporting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="size-4 mr-2" />
                Export My Data
              </>
            )}
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/30" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">Need an account?</span>
            </div>
          </div>

          {/* Sign up hint */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Sign up or log in from the main page to import your backup.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
