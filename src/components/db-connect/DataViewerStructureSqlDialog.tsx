import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type DataViewerStructureSqlDialogProps = {
  activeTable: string | null;
  isLoading: boolean;
  open: boolean;
  sql: string;
  onOpenChange: (open: boolean) => void;
};

export function DataViewerStructureSqlDialog({ activeTable, isLoading, open, sql, onOpenChange }: DataViewerStructureSqlDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="3xl">
        <DialogHeader><DialogTitle>{activeTable} SQL</DialogTitle></DialogHeader>
        <DialogBody>
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
            <code>{isLoading ? 'Loading...' : sql}</code>
          </pre>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
