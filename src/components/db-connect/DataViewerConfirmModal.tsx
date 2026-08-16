import ConfirmModal from '@/components/ConfirmModal';
import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogBody, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DestructiveConfirmationField } from './DestructiveConfirmationField';

type ConfirmAction = null | 'records' | 'column' | 'index' | 'check';

type DataViewerConfirmModalProps = {
  action: ConfirmAction;
  onCancel: () => void;
  onDeleteRecords: (confirmation?: string) => void;
  onDeleteStructure: () => void;
  confirmationTarget?: string | null;
};

export function DataViewerConfirmModal({ action, onCancel, onDeleteRecords, onDeleteStructure, confirmationTarget }: DataViewerConfirmModalProps) {
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => setConfirmation(''), [action]);
  if (action === 'records' && confirmationTarget) return (
    <AlertDialog open onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Delete Records</AlertDialogTitle></AlertDialogHeader>
        <AlertDialogBody className="space-y-3"><p className="text-sm text-muted-foreground">Selected records will be permanently deleted.</p><DestructiveConfirmationField expected={confirmationTarget} value={confirmation} onChange={setConfirmation} /></AlertDialogBody>
        <AlertDialogFooter><AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={confirmation !== confirmationTarget} onClick={() => onDeleteRecords(confirmation)}>Delete</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return (
    <ConfirmModal
      isOpen={action !== null}
      title={action === 'records' ? 'Delete Records' : action === 'column' ? 'Delete Column' : action === 'check' ? 'Delete Check' : 'Delete Index'}
      message={action === 'records'
        ? 'Selected records will be permanently deleted.'
        : action === 'column'
          ? 'This column and its data will be permanently deleted.'
          : action === 'check'
            ? 'This check constraint will be permanently deleted.'
            : 'This index will be permanently deleted.'}
      confirmText="Delete"
      onCancel={onCancel}
      onConfirm={action === 'records' ? onDeleteRecords : onDeleteStructure}
    />
  );
}
