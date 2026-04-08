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
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shrink-0",
              variant === 'danger' && "bg-destructive/20 text-destructive shadow-destructive/10",
              variant === 'warning' && "bg-yellow-500/20 text-yellow-500 shadow-yellow-500/10",
              variant === 'info' && "bg-primary/20 text-primary shadow-primary/10"
            )}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">{title}</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        
        <AlertDialogBody>
          <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {message}
          </AlertDialogDescription>
        </AlertDialogBody>

        <AlertDialogFooter className="flex gap-3 sm:justify-end">
          <AlertDialogCancel
            onClick={onCancel}
            className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold rounded-lg transition-all border-none"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              "px-4 py-2 text-white font-bold rounded-lg shadow-lg transition-all border-none",
              variant === 'danger' && "bg-destructive hover:bg-destructive/90 shadow-destructive/20",
              variant === 'warning' && "bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20",
              variant === 'info' && "bg-primary hover:bg-primary/90 shadow-primary/20"
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
