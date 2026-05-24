import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SQLImportForm, type SQLImportFormProps } from './SQLImportForm';

export interface ImportSQLModalProps extends SQLImportFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportSQLModal({
  isOpen,
  onOpenChange,
  ...formProps
}: ImportSQLModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import SQL (Reverse Engineering)</DialogTitle>
          <DialogDescription>
            Paste your SQL or upload a <code className="text-[10px] bg-muted px-1 rounded">.sql</code> file below.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          <SQLImportForm
            {...formProps}
            onComplete={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
