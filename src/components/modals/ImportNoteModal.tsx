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
  onImport: (file: File) => void | Promise<void>;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED_EXTENSIONS = ['.md', '.docx', '.txt'];

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
        
        setTimeout(async () => {
          await onImport(file);
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
      <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-2xl bg-popover text-foreground">
        <DialogHeader className="p-6 pb-0 flex flex-row items-center justify-between border-none bg-transparent">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-muted-foreground" />
            <DialogTitle className="text-xl font-semibold flex items-center gap-2 pr-0">
              Import Into 
              <Badge className="bg-primary/10 text-primary border-primary/20 font-medium px-2 py-0 text-[10px] uppercase tracking-wider">
                Experimental
              </Badge>
            </DialogTitle>
          </div>
        </DialogHeader>

        <DialogBody className="p-6 pt-4 space-y-6">
          <div className="bg-muted/40 border border-border rounded-xl p-4 flex gap-3 text-muted-foreground">
            <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              Select a single file <span className="text-foreground font-semibold">(.md, .docx, .txt)</span>.<br />
              <span className="text-muted-foreground">Maximum file size is 3MB.</span>
            </p>
          </div>

          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-16 transition-all duration-300 flex flex-col items-center justify-center gap-5 group cursor-pointer",
              isDragging ? "border-primary bg-primary/5 shadow-lg" : "border-border bg-muted/40 hover:border-primary/50 hover:bg-muted/60",
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
                <div className="w-20 h-20 rounded-2xl bg-muted border border-border flex items-center justify-center group-hover:scale-110 group-hover:bg-accent transition-all duration-300 shadow-xl">
                  <FileType className="w-9 h-9 text-muted-foreground group-hover:text-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-foreground tracking-tight">Drag & Drop</p>
                  <p className="text-sm text-muted-foreground mt-2 font-medium">or click to browse your files</p>
                </div>
              </>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".md,.txt,.docx"
              onChange={handleFileSelect}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
