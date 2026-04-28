import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogBody
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { History, RotateCcw, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRollback: (minutes: number) => Promise<void>;
  entityName: string;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ 
  isOpen, 
  onClose, 
  onRollback, 
  entityName 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRollbackClick = (minutes: number) => {
    onRollback(minutes);
  };

  const timeOptions = [
    { label: '5 Minutes ago', value: 5, icon: <Clock className="w-4 h-4" /> },
    { label: '15 Minutes ago', value: 15, icon: <Clock className="w-4 h-4" /> },
    { label: '30 Minutes ago', value: 30, icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-full">
              <History className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle>Version History</DialogTitle>
          </div>
          <DialogDescription>
            Choose a point in time to restore "{entityName}"
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3 py-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-400">
              Rollback will overwrite your current unsaved changes. Make sure you have a backup if needed.
            </p>
          </div>

          <div className="grid gap-2 pt-2">
            {timeOptions.map((option) => (
              <Button
                key={option.value}
                variant="outline"
                className="justify-between h-12 hover:bg-primary/5 hover:border-primary/30 transition-all"
                onClick={() => handleRollbackClick(option.value)}
                disabled={isProcessing}
              >
                <div className="flex items-center gap-3">
                  {option.icon}
                  <span className="font-medium">{option.label}</span>
                </div>
                <RotateCcw className="w-4 h-4 opacity-50" />
              </Button>
            ))}
          </div>
        </DialogBody>

        {isProcessing && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex flex-col items-center justify-center z-50 rounded-lg">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
            <p className="text-sm font-medium">Restoring version...</p>
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
