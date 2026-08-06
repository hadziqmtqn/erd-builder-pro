import ConfirmModal from '@/components/ConfirmModal';

type ConfirmAction = null | 'records' | 'column' | 'index' | 'check';

type DataViewerConfirmModalProps = {
  action: ConfirmAction;
  onCancel: () => void;
  onDeleteRecords: () => void;
  onDeleteStructure: () => void;
};

export function DataViewerConfirmModal({ action, onCancel, onDeleteRecords, onDeleteStructure }: DataViewerConfirmModalProps) {
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
