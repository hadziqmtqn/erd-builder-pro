import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportGuestData } from '@/lib/guestExport';
import { toast } from 'sonner';

export function DataExport() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportGuestData();
      toast.success('Data exported successfully');
    } catch (err: any) {
      toast.error('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Export Data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Download projects, notes, ERDs, DBML, flowcharts, drawings, and AI chats as JSON.
        </p>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/10 p-5 max-w-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">JSON Backup</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use this file with Import Data to restore or migrate your workspace data.
            </p>
          </div>
          <Button onClick={handleExport} disabled={isExporting} className="shrink-0">
            {isExporting ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : <Download className="size-3.5 mr-2" />}
            {isExporting ? 'Exporting...' : 'Export JSON'}
          </Button>
        </div>
      </div>
    </div>
  );
}
