import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { diff_match_patch, DIFF_EQUAL, DIFF_DELETE, DIFF_INSERT } from 'diff-match-patch';

interface DiffPreviewModalProps {
  isOpen: boolean;
  originalText: string;
  newText: string;
  onConfirm: () => void;
  onCancel: () => void;
  strategyLabel?: string;
}

function computeDiffs(original: string, modified: string) {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(original, modified);
  dmp.diff_cleanupSemantic(diffs);
  return diffs;
}

function DiffSegment({ op, text }: { op: number; text: string }) {
  if (op === DIFF_EQUAL) {
    return <span>{text}</span>;
  }
  if (op === DIFF_INSERT) {
    return (
      <span className="bg-green-500/20 text-green-700 dark:text-green-300 rounded-sm px-0.5">
        {text}
      </span>
    );
  }
  if (op === DIFF_DELETE) {
    return (
      <span className="bg-red-500/20 text-red-700 dark:text-red-300 line-through rounded-sm px-0.5">
        {text}
      </span>
    );
  }
  return null;
}

export const DiffPreviewModal: React.FC<DiffPreviewModalProps> = ({
  isOpen,
  originalText,
  newText,
  onConfirm,
  onCancel,
  strategyLabel,
}) => {
  const diffs = useMemo(() => computeDiffs(originalText, newText), [originalText, newText]);

  const hasChanges = diffs.some(([op]) => op !== DIFF_EQUAL);

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent size="4xl" className="max-h-[80vh] flex flex-col gap-0 !p-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>Review AI Changes {strategyLabel ? `(${strategyLabel})` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4 text-sm leading-relaxed whitespace-pre-wrap font-mono border-y">
          {hasChanges ? (
            diffs.map(([op, text], i) => <DiffSegment key={i} op={op} text={text} />)
          ) : (
            <p className="text-muted-foreground/60 italic">No changes detected</p>
          )}
        </div>

        <DialogFooter className="px-6 py-4 shrink-0">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>{strategyLabel || 'Apply Changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
