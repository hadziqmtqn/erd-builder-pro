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

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm" className="max-w-[400px]">
        <AlertDialogHeader className="flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <AlertDialogTitle className="text-xl sm:text-center">Are you absolutely sure?</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogBody className="text-center">
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the {itemLabel} from our servers.
          </AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter className="sm:justify-center flex-col sm:flex-row gap-2 mt-2">
          <AlertDialogCancel onClick={onCancel} className="mt-0 w-full sm:w-auto">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto">
            Permanently Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
