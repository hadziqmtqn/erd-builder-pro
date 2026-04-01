import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
      <AlertDialogContent className="max-w-md rounded-3xl border-none glass-panel shadow-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-4 mb-2">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
              variant === 'danger' && "bg-destructive/20 text-destructive shadow-destructive/10",
              variant === 'warning' && "bg-yellow-500/20 text-yellow-500 shadow-yellow-500/10",
              variant === 'info' && "bg-primary/20 text-primary shadow-primary/10"
            )}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-3 sm:justify-start mt-4">
          <AlertDialogCancel
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold rounded-2xl transition-all border-none"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              "flex-1 px-4 py-3 text-white font-bold rounded-2xl shadow-lg transition-all border-none",
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
