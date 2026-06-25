import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DiffPreviewModalProps {
  isOpen: boolean;
  originalHtml: string;
  newHtml: string;
  onConfirm: () => void;
  onCancel: () => void;
  strategyLabel?: string;
  isSaving?: boolean;
}

export const DiffPreviewModal: React.FC<DiffPreviewModalProps> = ({
  isOpen,
  originalHtml,
  newHtml,
  onConfirm,
  onCancel,
  strategyLabel,
  isSaving = false,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent size="4xl" className="max-h-[85vh] flex flex-col gap-0 p-0!">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>Review AI Changes {strategyLabel ? `(${strategyLabel})` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto border-y">
          <div className="grid grid-cols-2 divide-x divide-border min-h-75">
            {/* Original */}
            <div className="flex flex-col">
              <div className="sticky top-0 z-10 px-4 py-2 bg-muted/50 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Original
              </div>
              <div className="flex-1 px-5 py-4 prose prose-sm dark:prose-invert max-w-none text-sm [&_.tiptap-editor-content]:min-h-0! [&_img]:max-w-full [&_img]:h-auto">
                <div dangerouslySetInnerHTML={{ __html: originalHtml }} />
              </div>
            </div>

            {/* AI Changes */}
            <div className="flex flex-col">
              <div className="sticky top-0 z-10 px-4 py-2 bg-green-50 dark:bg-green-950/20 border-b text-[11px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">
                AI Changes
              </div>
              <div className="flex-1 px-5 py-4 prose prose-sm dark:prose-invert max-w-none text-sm [&_.tiptap-editor-content]:min-h-0! [&_img]:max-w-full [&_img]:h-auto">
                <div dangerouslySetInnerHTML={{ __html: newHtml }} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 shrink-0">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isSaving}>
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="size-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Saving...
              </span>
            ) : (strategyLabel || 'Apply Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
