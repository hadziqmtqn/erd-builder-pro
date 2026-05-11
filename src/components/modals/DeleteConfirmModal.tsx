import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogBody,
  AlertDialogMedia,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  itemType: string;
}

export function DeleteConfirmModal({
  isOpen,
  onOpenChange,
  onConfirm,
  onCancel,
  itemType
}: DeleteConfirmModalProps) {
  const itemLabel = itemType === 'erd' ? 'diagram' : itemType === 'notes' ? 'note' : itemType === 'drawings' ? 'drawing' : 'project';

  const description = itemType === 'project' ? (
    <>
      This action cannot be undone. Deleting this workspace will also permanently delete all
      <strong> notes, diagrams, drawings, and flowcharts</strong> inside it.
    </>
  ) : (
    <>This action cannot be undone. This will permanently delete the <strong>{itemLabel}</strong> from our servers.</>
  );

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
            {description}
          </AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Permanently Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
