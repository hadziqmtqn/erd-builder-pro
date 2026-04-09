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
import { cn } from '../lib/utils';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger'
}: ConfirmModalProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent size="sm" className="max-w-[400px]">
        <AlertDialogHeader className="flex flex-col items-center justify-center text-center">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center mb-2",
            variant === 'danger' && "bg-destructive/10 text-destructive",
            variant === 'warning' && "bg-yellow-500/10 text-yellow-500",
            variant === 'info' && "bg-primary/10 text-primary"
          )}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <AlertDialogTitle className="text-xl font-bold tracking-tight sm:text-center">{title}</AlertDialogTitle>
        </AlertDialogHeader>
        
        <AlertDialogBody className="text-center">
          <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {message}
          </AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter className="sm:justify-center flex-col sm:flex-row gap-2 mt-2">
          <AlertDialogCancel
            onClick={onCancel}
            className="mt-0 w-full sm:w-auto"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              "w-full sm:w-auto",
              variant === 'danger' && "bg-destructive hover:bg-destructive/90",
              variant === 'warning' && "bg-yellow-500 hover:bg-yellow-600",
              variant === 'info' && "bg-primary hover:bg-primary/90"
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
