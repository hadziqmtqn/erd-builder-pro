import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogBody,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogMedia,
} from '@/components/ui/alert-dialog';
import { Trash2, AlertTriangle } from 'lucide-react';

type ConfirmMode = 'move-to-trash' | 'permanent-delete';

interface MoveToTrashAlertProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: ConfirmMode;

  // For 'move-to-trash' mode: the document or project being moved
  activeDocument?: any;
  view?: string; // 'erd' | 'notes' | 'drawings' | 'flowchart' | 'project'
  deleteDiagram?: (id: number | string) => Promise<void> | void;
  deleteNote?: (uid: string) => Promise<void> | void;
  deleteDrawing?: (uid: string) => Promise<void> | void;
  deleteFlowchart?: (uid: string) => Promise<void> | void;
  deleteProject?: (id: number | string) => Promise<void> | void;
  fetchTrash?: () => void;

  // For 'permanent-delete' mode: simple confirmation callback
  itemType?: string;
  onConfirm?: () => void;

  /** Called after successful action — e.g. to redirect to table view */
  onAfterDelete?: () => void;
}

export const MoveToTrashAlert: React.FC<MoveToTrashAlertProps> = ({
  isOpen,
  onOpenChange,
  mode = 'move-to-trash',
  activeDocument,
  view,
  deleteDiagram,
  deleteNote,
  deleteDrawing,
  deleteFlowchart,
  deleteProject,
  fetchTrash,
  itemType,
  onConfirm,
  onAfterDelete,
}) => {
  const handleConfirm = async () => {
    if (mode === 'permanent-delete') {
      onConfirm?.();
      onAfterDelete?.();
      return;
    }

    // move-to-trash mode: allow caller-provided confirm callback
    if (onConfirm) {
      onConfirm();
      onAfterDelete?.();
      return;
    }

    const currentId = view === 'flowchart' || view === 'drawings'
      ? (activeDocument?.uid ?? activeDocument?.id)
      : activeDocument?.id;
    if (!currentId) return;
    if (view === 'erd') await deleteDiagram?.(currentId);
    else if (view === 'notes') await deleteNote?.(String(currentId));
    else if (view === 'drawings') await deleteDrawing?.(currentId);
    else if (view === 'flowchart') await deleteFlowchart?.(currentId);
    else if (view === 'project') await deleteProject?.(currentId);
    fetchTrash?.();
    onOpenChange(false);
    onAfterDelete?.();
  };

  const itemLabel = itemType === 'erd' ? 'diagram'
    : itemType === 'notes' ? 'note'
    : itemType === 'drawings' ? 'drawing'
    : itemType === 'project' ? 'workspace'
    : 'item';

  if (mode === 'permanent-delete') {
    const isProject = itemType === 'project';
    return (
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent size="sm" className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              {isProject ? (
                <>This action cannot be undone. Deleting this workspace will also permanently delete all
                  <strong> notes, diagrams, drawings, and flowcharts</strong> inside it.</>
              ) : (
                <>This action cannot be undone. This will permanently delete the <strong>{itemLabel}</strong> from our servers.</>
              )}
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // move-to-trash mode
  const isDocument = view !== 'project';
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm" className="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogMedia className={isDocument ? 'bg-destructive/10' : 'bg-destructive/10'}>
            <Trash2 className="w-5 h-5 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>{isDocument ? 'Move to Trash?' : 'Delete Workspace?'}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogBody>
          <AlertDialogDescription>
            {isDocument ? (
              <>
                Are you sure you want to move <strong>{activeDocument?.title || activeDocument?.name || 'this item'}</strong> to trash?
                <br />
                You can restore it later from the trash bin.
              </>
            ) : (
              <>
                This will move the workspace and all its contents to trash.
                <br />
                You can restore it later from the trash bin.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            {isDocument ? 'Move to Trash' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
