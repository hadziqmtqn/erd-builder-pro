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
import { Trash2 } from 'lucide-react';

interface MoveToTrashAlertProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  activeDocument: any; // can be diagram, note, drawing, flowchart
  view: string;
  deleteDiagram: (id: number | string) => Promise<void> | void;
  deleteNote: (uid: string) => Promise<void> | void;
  deleteDrawing: (id: number | string) => Promise<void> | void;
  deleteFlowchart: (id: number | string) => Promise<void> | void;
  fetchTrash: () => void;
}

export const MoveToTrashAlert: React.FC<MoveToTrashAlertProps> = ({
  isOpen,
  onOpenChange,
  activeDocument,
  view,
  deleteDiagram,
  deleteNote,
  deleteDrawing,
  deleteFlowchart,
  fetchTrash,
}) => {
  const handleConfirm = async () => {
    const currentId = activeDocument?.id;
    if (!currentId) return;
    if (view === 'erd') await deleteDiagram(currentId);
    else if (view === 'notes') await deleteNote(String(currentId));
    else if (view === 'drawings') await deleteDrawing(currentId);
    else if (view === 'flowchart') await deleteFlowchart(currentId);
    fetchTrash();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm" className="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10">
            <Trash2 className="w-5 h-5 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogBody>
          <AlertDialogDescription>
            Are you sure you want to move <strong>{activeDocument?.title || activeDocument?.name || 'this item'}</strong> to trash?
            <br />
            You can restore it later from the trash bin.
          </AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Move to Trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
