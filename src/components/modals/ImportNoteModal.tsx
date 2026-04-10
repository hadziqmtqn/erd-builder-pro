import React, { useState, useRef } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogBody
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Info, Upload, FileType } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ImportNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File) => void;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED_EXTENSIONS = ['.md', '.txt'];

export const ImportNoteModal = ({ isOpen, onClose, onImport }: ImportNoteModalProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const simulateProgress = (file: File) => {
    setIsUploading(true);
    setProgress(0);
    
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.random() * 15;
      if (currentProgress >= 100) {
        currentProgress = 100;
        setProgress(100);
        clearInterval(interval);
        
        setTimeout(() => {
          onImport(file);
          setIsUploading(false);
          setProgress(0);
          onClose();
        }, 300);
      } else {
        setProgress(Math.floor(currentProgress));
      }
    }, 100);
  };

  const validateAndProcessFile = (file: File) => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      toast.error("Unsupported file type", {
        description: `Currently we only support ${ALLOWED_EXTENSIONS.join(', ')} files.`
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large", {
        description: "The maximum file size is 3MB."
      });
      return;
    }

    simulateProgress(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
    // Reset input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-2xl bg-[#0f0f11] text-zinc-100">
        <DialogHeader className="p-6 pb-0 flex flex-row items-center justify-between border-none bg-transparent">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-zinc-400" />
            <DialogTitle className="text-xl font-semibold flex items-center gap-2 pr-0">
              Import Into 
              <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 font-medium px-2 py-0 text-[10px] uppercase tracking-wider">
                Experimental
              </Badge>
            </DialogTitle>
          </div>
        </DialogHeader>

        <DialogBody className="p-6 pt-4 space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 flex gap-3 text-zinc-300">
            <Info className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              Select a single file <span className="text-zinc-200 font-semibold">(.md or .txt)</span>.<br />
              <span className="text-zinc-500">Maximum file size is 3MB.</span>
            </p>
          </div>

          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-16 transition-all duration-300 flex flex-col items-center justify-center gap-5 group cursor-pointer",
              isDragging ? "border-indigo-500 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.1)]" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-800/30",
              isUploading && "pointer-events-none opacity-50"
            )}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            {isUploading ? (
              <div className="w-full max-w-sm space-y-4 py-4">
                <Progress value={progress}>
                  <ProgressLabel>Importing your file...</ProgressLabel>
                  <ProgressValue value={progress} />
                </Progress>
              </div>
            ) : (
              <>
                <div className="w-20 h-20 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center group-hover:scale-110 group-hover:bg-zinc-700/80 transition-all duration-300 shadow-xl">
                  <FileType className="w-9 h-9 text-zinc-400 group-hover:text-zinc-200" />
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-zinc-200 tracking-tight">Drag & Drop</p>
                  <p className="text-sm text-zinc-500 mt-2 font-medium">or click to browse your files</p>
                </div>
              </>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".md,.txt"
              onChange={handleFileSelect}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
