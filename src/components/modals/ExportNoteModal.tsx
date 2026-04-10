import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogBody,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  FileCode, 
  FileEdit, 
  ChevronDown, 
  Check,
  Download,
  FileBox
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ExportFormat = 'pdf' | 'markdown' | 'word' | 'print';

interface ExportNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, options: any, pageSize: any) => void;
}

export const ExportNoteModal = ({ isOpen, onClose, onExport }: ExportNoteModalProps) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('markdown');
  const [options, setOptions] = useState({
    includeTitle: true,
    includeMetadata: true,
    includeOutline: false,
    preserveFormatting: true,
    includeEmbedded: false,
    hideEmpty: true,
    showTypeLabels: false
  });
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');

  const handleExport = () => {
    if (selectedFormat === 'markdown' || selectedFormat === 'pdf' || selectedFormat === 'print') {
      onExport(selectedFormat, options, pageSize);
      onClose();
    } else {
      toast.info(`${selectedFormat === 'word' ? 'Microsoft Word' : String(selectedFormat).toUpperCase()} export is coming soon!`, {
        description: "Currently, we only support Markdown and PDF export.",
        duration: 4000
      });
    }
  };

  const formats = [
    { id: 'markdown', label: 'Markdown', icon: FileEdit, color: 'text-indigo-400' },
    { id: 'pdf', label: 'PDF (Compact)', icon: FileBox, color: 'text-red-400' },
    { id: 'print', label: 'High Quality (Print)', icon: FileText, color: 'text-emerald-400' },
    { id: 'word', label: 'Microsoft Word', icon: FileCode, color: 'text-blue-400' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl bg-[#0f0f11] text-zinc-100">
        <DialogHeader className="p-6 pb-4 border-none bg-transparent flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold tracking-tight pr-0">Export</DialogTitle>
        </DialogHeader>

        <DialogBody className="p-6 pt-0 space-y-8 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
          {/* Format Selection Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {formats.map((format) => (
              <button
                key={format.id}
                onClick={() => setSelectedFormat(format.id as ExportFormat)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-4 p-4 rounded-2xl border-2 transition-all duration-300 group min-h-[140px]",
                  selectedFormat === format.id 
                    ? "border-zinc-100 bg-zinc-900 shadow-[0_0_30px_rgba(255,255,255,0.05)]" 
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-800/60"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-300",
                  selectedFormat === format.id ? "bg-zinc-800" : "bg-zinc-800/50 group-hover:bg-zinc-800"
                )}>
                  <format.icon className={cn("w-6 h-6", format.color)} />
                </div>
                <span className={cn(
                  "text-sm font-bold tracking-tight text-center px-1 leading-tight transition-colors",
                  selectedFormat === format.id ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                )}>
                  {format.label}
                </span>
                
                {selectedFormat === format.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-zinc-100" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {selectedFormat === 'markdown' && (
            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-6 flex gap-4 text-zinc-400 items-center animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <FileEdit className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-sm leading-relaxed">
                <span className="text-zinc-200 font-semibold block mb-0.5">Plain-text Markdown</span>
                Export your notes in a clean, portable format. Paging and advanced layouts are not applicable to Markdown files.
              </p>
            </div>
          )}

          {/* Options Section */}
          {selectedFormat !== 'markdown' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-zinc-400">
                <FileBox className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Options</span>
              </div>
              <ChevronDown className="w-4 h-4 text-zinc-600" />
            </div>

            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 space-y-6">
              {[
                { id: 'includeTitle', label: 'Include Document Title', sub: 'Adds the title at the top of the exported file.' },
                { id: 'includeMetadata', label: 'Include Metadata', sub: 'Includes project name and last updated timestamp.' },
                { id: 'includeOutline', label: 'Include Table of Contents', sub: 'Generates an outline based on your headings.' },
                { id: 'preserveFormatting', label: 'Preserve Formatting', sub: 'Maintains colors, styles, and font weights precisely.' },
              ].map((opt) => (
                <label key={opt.id} className="flex items-start gap-5 cursor-pointer group">
                  <div className="relative flex items-center mt-1 shrink-0">
                    <input 
                      type="checkbox"
                      checked={(options as any)[opt.id]}
                      onChange={() => setOptions(prev => ({ ...prev, [opt.id]: !(prev as any)[opt.id] }))}
                      className="peer h-5 w-5 appearance-none rounded border-2 border-zinc-700 bg-transparent transition-all checked:border-zinc-100 checked:bg-zinc-100 cursor-pointer"
                    />
                    <Check className="absolute top-0.5 left-0.5 w-4 h-4 text-zinc-950 opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{opt.label}</span>
                    <span className="text-xs text-zinc-500 leading-relaxed">{opt.sub}</span>
                  </div>
                </label>
              ))}

              <div className="pt-4 border-t border-zinc-800/80">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3 ml-1">Page Format</p>
                <div className="flex gap-2 p-1 bg-zinc-950 rounded-lg w-fit">
                  {['a4', 'letter'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setPageSize(size as any)}
                      className={cn(
                        "px-4 py-1.5 text-xs font-bold rounded-md transition-all duration-200 uppercase",
                        pageSize === size 
                          ? "bg-zinc-800 text-white shadow-sm" 
                          : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogBody>

        <DialogFooter className="p-4 bg-zinc-900/40 border-t border-zinc-800/80">
          <Button 
            onClick={handleExport}
            className="bg-zinc-100 hover:bg-white text-zinc-950 font-bold px-8 h-10 rounded-lg shadow-lg active:scale-95 transition-all"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
