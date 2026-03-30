import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
            variant === 'danger' && "bg-red-500/20 text-red-500 shadow-red-500/10",
            variant === 'warning' && "bg-yellow-500/20 text-yellow-500 shadow-yellow-500/10",
            variant === 'info' && "bg-accent-primary/20 text-accent-primary shadow-accent-primary/10"
          )}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <button 
            onClick={onCancel}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <h3 className="text-xl font-bold mb-2 tracking-tight">{title}</h3>
        <p className="text-text-secondary text-sm leading-relaxed mb-8">
          {message}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-bg-tertiary hover:bg-bg-secondary text-text-primary font-bold rounded-2xl transition-all active:scale-[0.98]"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "flex-1 px-4 py-3 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-[0.98]",
              variant === 'danger' && "bg-red-500 hover:bg-red-600 shadow-red-500/20",
              variant === 'warning' && "bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20",
              variant === 'info' && "bg-accent-primary hover:bg-accent-secondary shadow-accent-primary/20"
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
