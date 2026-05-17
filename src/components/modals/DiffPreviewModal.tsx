import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Diff, parseDiff } from 'react-diff-view';
import 'react-diff-view/style/index.css';

interface DiffPreviewModalProps {
  isOpen: boolean;
  originalText: string;
  newText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DiffPreviewModal: React.FC<DiffPreviewModalProps> = ({
  isOpen,
  originalText,
  newText,
  onConfirm,
  onCancel,
}) => {
  // Simple diff generation - in production might need a more robust approach
  const diffText = `--- original
+++ modified
@@ -1 +1 @@
-${originalText}
+${newText}`;

  const files = parseDiff(diffText);

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review AI Changes</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto border rounded-md">
          <Diff viewType="split" diffType="modify" hunks={files[0].hunks} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Apply Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
